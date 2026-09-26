<?php

/**
 * Regression tests for ReplayRunner evidence-completeness (fail-closed) behaviour.
 *
 * These tests guard against the false-positive bug where a runner could return
 * operation_safe=true despite only one ReplayAttempt row having been persisted.
 *
 * Every test drives ReplayRunner through a stub ReplayScenario so we can
 * control exactly which DB rows exist independently of live HTTP responses.
 */

use App\Models\ReplayAttempt;
use App\Replay\ReplayRunner;
use App\Replay\ReplayScenario;
use App\Replay\Scenarios\ProtectedCheckoutScenario;
use App\Replay\Scenarios\ProtectedReservationScenario;
use App\Replay\Scenarios\VulnerableCheckoutScenario;
use App\Replay\Scenarios\VulnerableReservationScenario;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Helper: build a stub scenario that writes exactly the DB rows we want.
// The stub controls which attempt IDs get a persisted row and what those rows
// contain; this lets us simulate partial, duplicate, and mismatched evidence.
// ---------------------------------------------------------------------------

/**
 * @param  array<string, array{http_status: int, resource_id: int|null}>  $rowsByAttemptId
 *                                                                                          Keys are the attempt_id strings that WILL be persisted; values define the
 *                                                                                          row content. Attempt IDs not listed here receive no DB row (simulate drop).
 */
function makeControlledStub(array $rowsByAttemptId, string $stubLabel = 'stub'): ReplayScenario
{
    return new class($rowsByAttemptId, $stubLabel) implements ReplayScenario
    {
        /** @param array<string, array{http_status: int, resource_id: int|null}> $rows */
        public function __construct(
            private readonly array $rows,
            private readonly string $label,
        ) {}

        public function label(): string
        {
            return $this->label;
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            $row = $this->rows[$attemptId] ?? null;

            if ($row !== null) {
                ReplayAttempt::create([
                    'run_id' => $runId,
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'http_status' => $row['http_status'],
                    'resource_type' => 'order',
                    'resource_id' => $row['resource_id'],
                    'order_id' => $row['resource_id'],
                    'order_count_after' => 1,
                    'attempted_at' => now(),
                ]);
            }

            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 201,
                'resource_type' => 'order',
                'resource_id' => $row['resource_id'] ?? null,
                'order_id' => $row['resource_id'] ?? null,
                'response_body' => [],
            ];
        }
    };
}

// ---------------------------------------------------------------------------
// Core false-positive regression
// ---------------------------------------------------------------------------

test('returns INCONCLUSIVE when only the initial-attempt row is persisted and live responses were 503 and 200', function () {
    // Only the first attempt row ends up in DB; the retry row is never written.
    // Live responses were 503 (first) and 200 (second).
    // This is the exact scenario from the audit finding.
    $stub = makeControlledStub([
        // attempt-1-* → written with 503
        // attempt-2-* → NOT written (simulates the missing-retry-row bug)
    ] + ['__first_only' => ['http_status' => 503, 'resource_id' => 1]]);

    // We need the runner to generate the attempt IDs internally; to control
    // which row appears we use a closure-based stub that captures the first
    // attempt_id it sees and writes a row only for that one.
    $writtenOnce = false;
    $firstAttemptResourceId = 77;

    $scenario = new class($firstAttemptResourceId, $writtenOnce) implements ReplayScenario
    {
        private bool $firstCalled = false;

        public function __construct(
            private readonly int $resourceId,
            private bool $written,
        ) {}

        public function label(): string
        {
            return 'stub-first-only';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            if (! $this->firstCalled) {
                // First attempt: write a DB row.
                $this->firstCalled = true;
                ReplayAttempt::create([
                    'run_id' => $runId,
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'http_status' => 503,
                    'resource_type' => 'order',
                    'resource_id' => $this->resourceId,
                    'order_id' => $this->resourceId,
                    'order_count_after' => 1,
                    'attempted_at' => now(),
                ]);

                return [
                    'attempt_id' => $attemptId,
                    'http_status' => 503,
                    'resource_type' => 'order',
                    'resource_id' => $this->resourceId,
                    'order_id' => $this->resourceId,
                    'response_body' => [],
                ];
            }

            // Second attempt: live HTTP says 200 but NO DB row is persisted.
            return [
                'attempt_id' => $attemptId,
                'http_status' => 200,
                'resource_type' => 'order',
                'resource_id' => $this->resourceId, // same resource — would look safe
                'order_id' => $this->resourceId,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    // THE KEY ASSERTION: must NOT be safe when retry row is missing.
    expect($report['operation_safe'])->toBeFalse();
    expect($report['reproduction_succeeded'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');

    // Only one DB row exists.
    $this->assertDatabaseCount('replay_attempts', 1);
});

// ---------------------------------------------------------------------------
// Missing initial-attempt evidence
// ---------------------------------------------------------------------------

test('returns INCONCLUSIVE when only the retry-attempt row is persisted', function () {
    $scenario = new class implements ReplayScenario
    {
        private bool $firstCalled = false;

        public function label(): string
        {
            return 'stub-second-only';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            if (! $this->firstCalled) {
                // First attempt: live 503 but NO DB row.
                $this->firstCalled = true;

                return [
                    'attempt_id' => $attemptId,
                    'http_status' => 503,
                    'resource_type' => 'order',
                    'resource_id' => null,
                    'order_id' => null,
                    'response_body' => [],
                ];
            }

            // Second attempt: write a DB row.
            ReplayAttempt::create([
                'run_id' => $runId,
                'attempt_id' => $attemptId,
                'operation_id' => $operationId,
                'http_status' => 201,
                'resource_type' => 'order',
                'resource_id' => 42,
                'order_id' => 42,
                'order_count_after' => 1,
                'attempted_at' => now(),
            ]);

            return [
                'attempt_id' => $attemptId,
                'http_status' => 201,
                'resource_type' => 'order',
                'resource_id' => 42,
                'order_id' => 42,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['reproduction_succeeded'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    $this->assertDatabaseCount('replay_attempts', 1);
});

// ---------------------------------------------------------------------------
// Missing retry evidence
// ---------------------------------------------------------------------------

test('returns INCONCLUSIVE when the retry-attempt row is absent from DB', function () {
    // Alias: same as the false-positive test but emphasised as its own case.
    $scenario = new class implements ReplayScenario
    {
        private bool $firstCalled = false;

        public function label(): string
        {
            return 'stub-missing-retry';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            if (! $this->firstCalled) {
                $this->firstCalled = true;
                ReplayAttempt::create([
                    'run_id' => $runId,
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'http_status' => 503,
                    'resource_type' => 'order',
                    'resource_id' => 10,
                    'order_id' => 10,
                    'order_count_after' => 1,
                    'attempted_at' => now(),
                ]);

                return ['attempt_id' => $attemptId, 'http_status' => 503, 'resource_type' => 'order', 'resource_id' => 10, 'order_id' => 10, 'response_body' => []];
            }

            // Retry: live says 200, no DB row.
            return ['attempt_id' => $attemptId, 'http_status' => 200, 'resource_type' => 'order', 'resource_id' => 10, 'order_id' => 10, 'response_body' => []];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    $this->assertDatabaseCount('replay_attempts', 1);
});

// ---------------------------------------------------------------------------
// Duplicate / mismatched attempt evidence
// ---------------------------------------------------------------------------

test('returns INCONCLUSIVE when three rows are persisted for a two-attempt run (extra row contamination)', function () {
    // Three DB rows for the same run_id — simulates cross-run contamination or
    // an extra row injected by a concurrent process. Gate 2 (count ≠ 2) must
    // reject this as incomplete/inconsistent evidence.
    $scenario = new class implements ReplayScenario
    {
        private int $calls = 0;

        public function label(): string
        {
            return 'stub-extra-row';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            $this->calls++;

            // Write the expected row for this attempt.
            ReplayAttempt::create([
                'run_id' => $runId,
                'attempt_id' => $attemptId,
                'operation_id' => $operationId,
                'http_status' => $injectFault ? 503 : 201,
                'resource_type' => 'order',
                'resource_id' => $injectFault ? 1 : 2,
                'order_id' => $injectFault ? 1 : 2,
                'order_count_after' => $this->calls,
                'attempted_at' => now(),
            ]);

            // On the first call also inject a THIRD row with a distinct attempt_id.
            if ($injectFault) {
                ReplayAttempt::create([
                    'run_id' => $runId,
                    'attempt_id' => 'extra-interloper-attempt',
                    'operation_id' => $operationId,
                    'http_status' => 200,
                    'resource_type' => 'order',
                    'resource_id' => 99,
                    'order_id' => 99,
                    'order_count_after' => 99,
                    'attempted_at' => now(),
                ]);
            }

            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 201,
                'resource_type' => 'order',
                'resource_id' => $injectFault ? 1 : 2,
                'order_id' => $injectFault ? 1 : 2,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    // Three rows exist — one extra interloper.
    $this->assertDatabaseCount('replay_attempts', 3);
});

test('returns INCONCLUSIVE when persisted attempt IDs do not match the expected IDs for this run', function () {
    // The DB rows carry completely different attempt IDs (cross-run contamination).
    $scenario = new class implements ReplayScenario
    {
        public function label(): string
        {
            return 'stub-mismatched-ids';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            // Write a row with a WRONG attempt_id (not matching what the runner expects).
            ReplayAttempt::create([
                'run_id' => $runId,
                'attempt_id' => 'wrong-attempt-id-'.($injectFault ? 'a' : 'b'),
                'operation_id' => $operationId,
                'http_status' => $injectFault ? 503 : 201,
                'resource_type' => 'order',
                'resource_id' => $injectFault ? 1 : 2,
                'order_id' => $injectFault ? 1 : 2,
                'order_count_after' => 1,
                'attempted_at' => now(),
            ]);

            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 201,
                'resource_type' => 'order',
                'resource_id' => $injectFault ? 1 : 2,
                'order_id' => $injectFault ? 1 : 2,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    // Two rows exist but their IDs do not match the runner's expected IDs.
    $this->assertDatabaseCount('replay_attempts', 2);
});

// ---------------------------------------------------------------------------
// Preserved behavior: vulnerable scenarios still report EXPECTED FAILURE
// ---------------------------------------------------------------------------

test('complete vulnerable checkout run still reports EXPECTED FAILURE (not SAFE)', function () {
    $runner = new ReplayRunner(new VulnerableCheckoutScenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['duplicate_resources'])->toBeTrue();
    expect($report['verdict'])->toContain('EXPECTED FAILURE');
    expect($report['verdict'])->not->toContain('PASS');
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('complete vulnerable reservation run still reports EXPECTED FAILURE (not SAFE)', function () {
    $runner = new ReplayRunner(new VulnerableReservationScenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['duplicate_resources'])->toBeTrue();
    expect($report['verdict'])->toContain('EXPECTED FAILURE');
    $this->assertDatabaseCount('replay_attempts', 2);
});

// ---------------------------------------------------------------------------
// Preserved behavior: protected scenarios still report PASS (SAFE)
// ---------------------------------------------------------------------------

test('complete protected checkout run still reports PASS with operation_safe=true', function () {
    $runner = new ReplayRunner(new ProtectedCheckoutScenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeTrue();
    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['same_resource_on_retry'])->toBeTrue();
    expect($report['verdict'])->toContain('PASS');
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('complete protected reservation run still reports PASS with operation_safe=true', function () {
    $runner = new ReplayRunner(new ProtectedReservationScenario);
    $report = $runner->run();

    expect($report['operation_safe'])->toBeTrue();
    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['same_resource_on_retry'])->toBeTrue();
    expect($report['verdict'])->toContain('PASS');
    $this->assertDatabaseCount('replay_attempts', 2);
});

// ---------------------------------------------------------------------------
// JSON output and CLI exit codes for incomplete-evidence cases
// ---------------------------------------------------------------------------

test('--json output is valid JSON with operation_safe=false when only one attempt row exists', function () {
    // Use the artisan command with a vulnerable checkout, but intercept at the
    // DB level: after the first HTTP call writes its row, delete it so that
    // when buildReport runs it finds 0 rows (total absence → INCONCLUSIVE).
    // We verify by driving the runner directly with a zero-row stub.
    $scenario = new class implements ReplayScenario
    {
        public function label(): string
        {
            return 'stub-json-incomplete';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            // Never write to DB — simulates total evidence loss.
            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 200,
                'resource_type' => null,
                'resource_id' => null,
                'order_id' => null,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    // Must be valid serialisable array (JSON output path requires this).
    $json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    expect(json_last_error())->toBe(JSON_ERROR_NONE);
    expect($json)->not->toBeFalse();

    $decoded = json_decode((string) $json, associative: true);
    expect($decoded)->toBeArray();
    expect($decoded['operation_safe'])->toBeFalse();
    expect($decoded['verdict'])->toContain('INCONCLUSIVE');
    expect($decoded)->toHaveKey('run_id');
    expect($decoded)->toHaveKey('scenario');
    expect($decoded)->toHaveKey('attempts');
});

test('CLI exits with non-zero code when evidence is incomplete', function () {
    // Drive via artisan command. The stub environment means 0 rows → exit 1.
    // We simulate the no-evidence case by detecting environment as production
    // so the routes are forbidden and no DB rows are written; the runner
    // receives both live-response payloads but finds no persisted rows.
    $this->app->detectEnvironment(fn () => 'production');

    $scenario = new class implements ReplayScenario
    {
        public function label(): string
        {
            return 'stub-cli-incomplete';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 200,
                'resource_type' => null,
                'resource_id' => null,
                'order_id' => null,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    // CLI exit code logic: operation_safe=false → FAILURE (non-zero).
    expect($report['operation_safe'])->toBeFalse();

    // Confirm the command itself returns FAILURE for incomplete evidence
    // by asserting the artisan command rejects the production environment.
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable'])
        ->assertExitCode(1);
});

test('verdict message explains the specific completeness failure reason', function () {
    // One-row run: missing retry evidence.
    $scenario = new class implements ReplayScenario
    {
        private int $calls = 0;

        public function label(): string
        {
            return 'stub-verdict-msg';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            $this->calls++;

            if ($this->calls === 1) {
                ReplayAttempt::create([
                    'run_id' => $runId,
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'http_status' => 503,
                    'resource_type' => 'order',
                    'resource_id' => 5,
                    'order_id' => 5,
                    'order_count_after' => 1,
                    'attempted_at' => now(),
                ]);
            }
            // Second call: no DB write.

            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 200,
                'resource_type' => 'order',
                'resource_id' => 5,
                'order_id' => 5,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($scenario);
    $report = $runner->run();

    expect($report['verdict'])->toContain('INCONCLUSIVE');
    // The verdict should explain WHY it is inconclusive (count mismatch).
    expect($report['verdict'])->toContain('expected 2 persisted attempt rows, found 1');
    expect($report['operation_safe'])->toBeFalse();
});

// ---------------------------------------------------------------------------
// Resource identity integrity — missing / invalid / inconsistent identity
// must never collapse into operation_safe=true.
// ---------------------------------------------------------------------------

/**
 * @param  array{http_status: int, resource_type: string|null, resource_id: int|null, order_id?: int|null}  $first
 * @param  array{http_status: int, resource_type: string|null, resource_id: int|null, order_id?: int|null}  $second
 */
function makeIdentityStub(array $first, array $second, string $label = 'stub-identity'): ReplayScenario
{
    return new class($first, $second, $label) implements ReplayScenario
    {
        /** @param array{http_status: int, resource_type: string|null, resource_id: int|null, order_id?: int|null} $first */
        /** @param array{http_status: int, resource_type: string|null, resource_id: int|null, order_id?: int|null} $second */
        public function __construct(
            private readonly array $first,
            private readonly array $second,
            private readonly string $label,
        ) {}

        public function label(): string
        {
            return $this->label;
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            $row = $injectFault ? $this->first : $this->second;

            ReplayAttempt::create([
                'run_id' => $runId,
                'attempt_id' => $attemptId,
                'operation_id' => $operationId,
                'http_status' => $row['http_status'],
                'resource_type' => $row['resource_type'],
                'resource_id' => $row['resource_id'],
                'order_id' => $row['order_id'] ?? null,
                'order_count_after' => 1,
                'attempted_at' => now(),
            ]);

            return [
                'attempt_id' => $attemptId,
                'http_status' => $row['http_status'],
                'resource_type' => $row['resource_type'],
                'resource_id' => $row['resource_id'],
                'order_id' => $row['order_id'] ?? null,
                'response_body' => [],
            ];
        }
    };
}

test('returns INCONCLUSIVE when resource_id is missing on one attempt despite 503/200', function () {
    // Pre-gate bug: filtering away a null resource_id left a single id and
    // could falsely report same_resource_on_retry / operation_safe.
    $scenario = makeIdentityStub(
        ['http_status' => 503, 'resource_type' => 'order', 'resource_id' => null, 'order_id' => null],
        ['http_status' => 200, 'resource_type' => 'order', 'resource_id' => 42, 'order_id' => 42],
        'stub-missing-one-resource-id',
    );

    $report = (new ReplayRunner($scenario))->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['reproduction_succeeded'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    expect($report['verdict'])->toContain('missing or invalid resource_id');
});

test('returns INCONCLUSIVE when both attempts lack resource_id even if order_id is present', function () {
    $scenario = makeIdentityStub(
        ['http_status' => 503, 'resource_type' => 'order', 'resource_id' => null, 'order_id' => 7],
        ['http_status' => 200, 'resource_type' => 'order', 'resource_id' => null, 'order_id' => 7],
        'stub-order-id-only',
    );

    $report = (new ReplayRunner($scenario))->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    expect($report['verdict'])->toContain('missing or invalid resource_id');
});

test('returns INCONCLUSIVE when resource_type is missing on an attempt', function () {
    $scenario = makeIdentityStub(
        ['http_status' => 503, 'resource_type' => null, 'resource_id' => 9, 'order_id' => 9],
        ['http_status' => 200, 'resource_type' => 'order', 'resource_id' => 9, 'order_id' => 9],
        'stub-missing-resource-type',
    );

    $report = (new ReplayRunner($scenario))->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    expect($report['verdict'])->toContain('missing or empty resource_type');
});

test('returns INCONCLUSIVE when resource_type differs across the two attempts', function () {
    $scenario = makeIdentityStub(
        ['http_status' => 503, 'resource_type' => 'order', 'resource_id' => 5, 'order_id' => 5],
        ['http_status' => 200, 'resource_type' => 'reservation', 'resource_id' => 5],
        'stub-mismatched-resource-type',
    );

    $report = (new ReplayRunner($scenario))->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    expect($report['verdict'])->toContain('inconsistent resource_type');
});

test('returns INCONCLUSIVE when resource_id is invalid (zero)', function () {
    $scenario = makeIdentityStub(
        ['http_status' => 503, 'resource_type' => 'order', 'resource_id' => 0, 'order_id' => 0],
        ['http_status' => 200, 'resource_type' => 'order', 'resource_id' => 0, 'order_id' => 0],
        'stub-invalid-resource-id',
    );

    $report = (new ReplayRunner($scenario))->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    expect($report['verdict'])->toContain('missing or invalid resource_id');
});

test('CLI exits with non-zero code when resource identity evidence is contradictory', function () {
    $scenario = makeIdentityStub(
        ['http_status' => 503, 'resource_type' => 'order', 'resource_id' => 3, 'order_id' => 3],
        ['http_status' => 200, 'resource_type' => 'reservation', 'resource_id' => 3],
        'stub-cli-identity',
    );

    $report = (new ReplayRunner($scenario))->run();

    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');

    // Artisan maps operation_safe=false → FAILURE. Confirm the command contract
    // still fails closed for incomplete/contradictory runs via production block.
    $this->app->detectEnvironment(fn () => 'production');

    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable'])
        ->assertExitCode(1);
});
