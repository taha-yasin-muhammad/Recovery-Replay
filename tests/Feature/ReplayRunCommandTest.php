<?php

use App\Models\Order;
use App\Models\ReplayAttempt;
use App\Replay\ReplayRunner;
use App\Replay\ReplayScenario;
use App\Replay\Scenarios\ProtectedCheckoutScenario;
use App\Replay\Scenarios\VulnerableCheckoutScenario;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// replay:run checkout --mode=vulnerable
// Expects: two orders created, first attempt 503, second 201.

test('replay:run checkout vulnerable exits 1 (not safe) and creates two orders', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable'])
        ->assertExitCode(1);

    $this->assertDatabaseCount('orders', 2);
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('replay:run checkout vulnerable records 503 then 201', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);

    $attempts = ReplayAttempt::orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(201);
});

test('replay:run checkout vulnerable produces two distinct order IDs', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);

    $attempts = ReplayAttempt::all();

    $uniqueOrderIds = $attempts->pluck('order_id')->unique();
    expect($uniqueOrderIds)->toHaveCount(2);
});

test('replay:run checkout vulnerable JSON report exits 1 (not safe) and creates two orders', function () {
    $this->artisan('replay:run checkout --mode=vulnerable --json')
        ->assertExitCode(1);

    $this->assertDatabaseCount('orders', 2);
    $this->assertDatabaseCount('replay_attempts', 2);
});

// replay:run checkout --mode=protected
// Expects: one order created, first attempt 503, second 200, same order_id.

test('replay:run checkout protected exits 0 and creates exactly one order', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'protected'])
        ->assertExitCode(0);

    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('replay:run checkout protected records 503 then 200', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'protected']);

    $attempts = ReplayAttempt::orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(200);
});

test('replay:run checkout protected both attempts reference the same order', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'protected']);

    $attempts = ReplayAttempt::all();

    expect($attempts->pluck('order_id')->unique())->toHaveCount(1);
    expect($attempts[0]->order_id)->toBe($attempts[1]->order_id);
});

test('replay:run checkout protected JSON report exits 0 and creates one order', function () {
    $this->artisan('replay:run checkout --mode=protected --json')
        ->assertExitCode(0);

    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseCount('replay_attempts', 2);
});

// Edge cases

test('replay:run rejects unknown scenario with exit code 1', function () {
    $this->artisan('replay:run', ['scenario' => 'nonexistent', '--mode' => 'vulnerable'])
        ->assertExitCode(1);
});

test('replay:run rejects unknown mode with exit code 1', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'unknown'])
        ->assertExitCode(1);
});

test('replay:run assigns a fresh run_id per execution so evidence is isolated', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);

    // Both runs together leave 4 attempts in the database.
    $this->assertDatabaseCount('replay_attempts', 4);

    // Those 4 attempts carry exactly 2 distinct run_ids.
    $distinctRunIds = ReplayAttempt::pluck('run_id')->unique()->values();
    expect($distinctRunIds)->toHaveCount(2);
    expect($distinctRunIds[0])->not->toBe($distinctRunIds[1]);
});

// Report field separation: reproduction_succeeded vs operation_safe

test('vulnerable scenario report sets reproduction_succeeded true but operation_safe false', function () {
    $runner = new ReplayRunner(new VulnerableCheckoutScenario);
    $report = $runner->run();

    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['operation_safe'])->toBeFalse();
    expect($report['duplicate_orders'])->toBeTrue();
});

test('protected scenario report sets both reproduction_succeeded and operation_safe true', function () {
    $runner = new ReplayRunner(new ProtectedCheckoutScenario);
    $report = $runner->run();

    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['operation_safe'])->toBeTrue();
    expect($report['same_order_on_retry'])->toBeTrue();
});

test('vulnerable scenario verdict contains EXPECTED FAILURE, not PASS', function () {
    $runner = new ReplayRunner(new VulnerableCheckoutScenario);
    $report = $runner->run();

    expect($report['verdict'])->toContain('EXPECTED FAILURE');
    expect($report['verdict'])->not->toContain('PASS');
});

test('protected scenario verdict contains PASS', function () {
    $runner = new ReplayRunner(new ProtectedCheckoutScenario);
    $report = $runner->run();

    expect($report['verdict'])->toContain('PASS');
});

// Missing evidence: runner returns INCONCLUSIVE when no attempts were recorded

test('runner returns INCONCLUSIVE when no evidence is recorded for the run', function () {
    // Simulate by running in production environment so no evidence is saved.
    $this->app->detectEnvironment(fn () => 'production');

    // In production the routes are not registered, so we drive the runner
    // directly with a custom stub scenario that returns plausible payloads
    // but never records DB evidence (production env silences DB writes inside
    // the controllers — since the routes don't even exist, we fake the HTTP).
    $stub = new class implements ReplayScenario
    {
        public function label(): string
        {
            return 'stub';
        }

        public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
        {
            return [
                'attempt_id' => $attemptId,
                'http_status' => $injectFault ? 503 : 201,
                'resource_type' => null,
                'resource_id' => null,
                'order_id' => null,
                'response_body' => [],
            ];
        }
    };

    $runner = new ReplayRunner($stub);
    $report = $runner->run();

    expect($report['reproduction_succeeded'])->toBeFalse();
    expect($report['operation_safe'])->toBeFalse();
    expect($report['verdict'])->toContain('INCONCLUSIVE');
    expect($report['attempts'])->toBeEmpty();
});

// --json output must be valid JSON

test('--json flag outputs valid parseable JSON', function () {
    $exitCode = Artisan::call('replay:run', ['scenario' => 'checkout', '--mode' => 'protected', '--json' => true]);

    expect($exitCode)->toBe(0);

    $output = Artisan::output();

    $decoded = json_decode($output, associative: true);
    expect(json_last_error())->toBe(JSON_ERROR_NONE);
    expect($decoded)->toBeArray();
    expect($decoded)->toHaveKey('run_id');
    expect($decoded)->toHaveKey('reproduction_succeeded');
    expect($decoded)->toHaveKey('operation_safe');
    expect($decoded)->toHaveKey('verdict');
});

test('--json output for vulnerable scenario contains correct field values', function () {
    Artisan::call('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable', '--json' => true]);

    $decoded = json_decode(Artisan::output(), associative: true);

    expect($decoded['reproduction_succeeded'])->toBeTrue();
    expect($decoded['operation_safe'])->toBeFalse();
    expect($decoded['duplicate_orders'])->toBeTrue();
});

// Production environment restriction for demo checkout and replay endpoints

test('/api/checkout is forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->postJson('/api/checkout', ['operation_id' => 'op-prod-check']);

    $response->assertStatus(403);
});

test('/api/checkout/protected is forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-prod-prot',
        'idempotency_key' => 'idem-prod',
    ]);

    $response->assertStatus(403);
});

test('/api/replay-runs is forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->getJson('/api/replay-runs/some-run-id');

    $response->assertStatus(403);
});
