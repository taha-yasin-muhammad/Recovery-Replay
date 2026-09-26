<?php

use App\Models\ReplayAttempt;
use App\Models\ReplayComparison;
use App\Replay\ComparisonService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

/**
 * Seeds a complete two-attempt run with valid resource identity.
 *
 * @param  array{http_status: int, resource_id: int}  $first
 * @param  array{http_status: int, resource_id: int}  $second
 */
function seedValidRun(
    string $runId,
    string $resourceType,
    array $first,
    array $second,
): void {
    ReplayAttempt::create([
        'run_id' => $runId,
        'attempt_id' => "attempt-{$runId}-1",
        'operation_id' => "op-{$runId}",
        'order_id' => $resourceType === 'order' ? $first['resource_id'] : null,
        'resource_type' => $resourceType,
        'resource_id' => $first['resource_id'],
        'http_status' => $first['http_status'],
        'order_count_after' => 1,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
    ]);

    ReplayAttempt::create([
        'run_id' => $runId,
        'attempt_id' => "attempt-{$runId}-2",
        'operation_id' => "op-{$runId}",
        'order_id' => $resourceType === 'order' ? $second['resource_id'] : null,
        'resource_type' => $resourceType,
        'resource_id' => $second['resource_id'],
        'http_status' => $second['http_status'],
        'order_count_after' => 2,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
    ]);
}

// ── Valid comparisons ──────────────────────────────────────────────────────────

test('saves a valid checkout comparison (unsafe before, safe after)', function () {
    seedValidRun('before-checkout', 'order',
        ['http_status' => 503, 'resource_id' => 10],
        ['http_status' => 201, 'resource_id' => 11],
    );

    seedValidRun('after-checkout', 'order',
        ['http_status' => 503, 'resource_id' => 20],
        ['http_status' => 200, 'resource_id' => 20],
    );

    $result = ComparisonService::save('before-checkout', 'after-checkout');

    expect($result['saved'])->toBeTrue()
        ->and($result['comparison_id'])->toBeString()
        ->and($result['error'])->toBeNull();

    $this->assertDatabaseHas('replay_comparisons', [
        'before_run_id' => 'before-checkout',
        'after_run_id' => 'after-checkout',
        'resource_type' => 'order',
    ]);
});

test('saves a valid reservation comparison', function () {
    seedValidRun('before-reservation', 'reservation',
        ['http_status' => 503, 'resource_id' => 30],
        ['http_status' => 201, 'resource_id' => 31],
    );

    seedValidRun('after-reservation', 'reservation',
        ['http_status' => 503, 'resource_id' => 40],
        ['http_status' => 200, 'resource_id' => 40],
    );

    $result = ComparisonService::save('before-reservation', 'after-reservation');

    expect($result['saved'])->toBeTrue()
        ->and($result['comparison_id'])->toBeString()
        ->and($result['error'])->toBeNull();

    $this->assertDatabaseHas('replay_comparisons', [
        'before_run_id' => 'before-reservation',
        'after_run_id' => 'after-reservation',
        'resource_type' => 'reservation',
    ]);
});

// ── Comparison re-open without new DB writes ───────────────────────────────────

test('reopening a saved comparison does not create a second comparison row', function () {
    seedValidRun('run-reopen-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedValidRun('run-reopen-after', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $result = ComparisonService::save('run-reopen-before', 'run-reopen-after');

    expect($result['saved'])->toBeTrue();

    // Simulating re-open = reading the comparison row, no additional saves.
    $comparison = ReplayComparison::find($result['comparison_id']);

    expect($comparison)->not->toBeNull()
        ->and($comparison->before_run_id)->toBe('run-reopen-before')
        ->and($comparison->after_run_id)->toBe('run-reopen-after');

    $this->assertDatabaseCount('replay_comparisons', 1);
});

// ── Invalid inputs ─────────────────────────────────────────────────────────────

test('rejects identical run ids', function () {
    seedValidRun('run-same-id', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    $result = ComparisonService::save('run-same-id', 'run-same-id');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('distinct');

    $this->assertDatabaseCount('replay_comparisons', 0);
});

test('rejects empty run ids', function () {
    $result = ComparisonService::save('', 'after-run');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('empty');
});

test('rejects missing before_run_id evidence', function () {
    seedValidRun('only-after', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $result = ComparisonService::save('does-not-exist', 'only-after');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('before_run_id');

    $this->assertDatabaseCount('replay_comparisons', 0);
});

test('rejects missing after_run_id evidence', function () {
    seedValidRun('only-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    $result = ComparisonService::save('only-before', 'does-not-exist');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('after_run_id');

    $this->assertDatabaseCount('replay_comparisons', 0);
});

// ── Mismatched domains ─────────────────────────────────────────────────────────

test('rejects mismatched business domains', function () {
    seedValidRun('before-order', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedValidRun('after-reservation', 'reservation',
        ['http_status' => 503, 'resource_id' => 10],
        ['http_status' => 200, 'resource_id' => 10],
    );

    $result = ComparisonService::save('before-order', 'after-reservation');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('resource type');

    $this->assertDatabaseCount('replay_comparisons', 0);
});

// ── Incomplete / contradictory evidence ───────────────────────────────────────

test('rejects before run with incomplete evidence (single attempt)', function () {
    // Only one attempt — evaluateHistorical will flag as incomplete.
    ReplayAttempt::create([
        'run_id' => 'before-incomplete',
        'attempt_id' => 'attempt-i-1',
        'operation_id' => 'op-i',
        'order_id' => 1,
        'resource_type' => 'order',
        'resource_id' => 1,
        'http_status' => 503,
        'order_count_after' => 1,
        'attempted_at' => now(),
    ]);

    seedValidRun('after-complete', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $result = ComparisonService::save('before-incomplete', 'after-complete');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('incomplete');
});

test('rejects after run with incomplete evidence (single attempt)', function () {
    seedValidRun('before-valid', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    ReplayAttempt::create([
        'run_id' => 'after-incomplete',
        'attempt_id' => 'attempt-ai-1',
        'operation_id' => 'op-ai',
        'order_id' => 5,
        'resource_type' => 'order',
        'resource_id' => 5,
        'http_status' => 200,
        'order_count_after' => 1,
        'attempted_at' => now(),
    ]);

    $result = ComparisonService::save('before-valid', 'after-incomplete');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain('incomplete');
});

test('rejects a safe run on the before side', function () {
    // A safe run on Before means it is not demonstrating the vulnerability.
    seedValidRun('before-safe', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    seedValidRun('after-valid', 'order',
        ['http_status' => 503, 'resource_id' => 8],
        ['http_status' => 200, 'resource_id' => 8],
    );

    $result = ComparisonService::save('before-safe', 'after-valid');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain("'unsafe'");
});

test('rejects an unsafe run on the after side', function () {
    seedValidRun('before-unsafe', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    // Unsafe after run: duplicate resources.
    seedValidRun('after-unsafe', 'order',
        ['http_status' => 503, 'resource_id' => 3],
        ['http_status' => 201, 'resource_id' => 4],
    );

    $result = ComparisonService::save('before-unsafe', 'after-unsafe');

    expect($result['saved'])->toBeFalse()
        ->and($result['error'])->toContain("'safe'");
});

// ── Evidence isolation ─────────────────────────────────────────────────────────

test('evidence for before and after runs is independent', function () {
    seedValidRun('iso-before', 'order',
        ['http_status' => 503, 'resource_id' => 100],
        ['http_status' => 201, 'resource_id' => 101],
    );

    seedValidRun('iso-after', 'order',
        ['http_status' => 503, 'resource_id' => 200],
        ['http_status' => 200, 'resource_id' => 200],
    );

    $result = ComparisonService::save('iso-before', 'iso-after');

    expect($result['saved'])->toBeTrue();

    // Verify that the before run's attempts are not affected by the after run.
    $beforeAttempts = ReplayAttempt::where('run_id', 'iso-before')->get();
    $afterAttempts = ReplayAttempt::where('run_id', 'iso-after')->get();

    expect($beforeAttempts->pluck('resource_id')->sort()->values()->all())
        ->toBe([100, 101]);

    expect($afterAttempts->pluck('resource_id')->sort()->values()->all())
        ->toBe([200, 200]);

    // No cross-contamination.
    expect($beforeAttempts->pluck('run_id')->unique()->all())->toBe(['iso-before']);
    expect($afterAttempts->pluck('run_id')->unique()->all())->toBe(['iso-after']);
});

// ── Independent reruns must not modify saved comparisons ──────────────────────

test('rerunning a side does not mutate existing saved comparisons', function () {
    seedValidRun('rerun-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedValidRun('rerun-after', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $saveResult = ComparisonService::save('rerun-before', 'rerun-after');
    expect($saveResult['saved'])->toBeTrue();

    $comparisonId = $saveResult['comparison_id'];

    // Simulate a re-run of the 'after' side by creating a new run with the
    // same resource_type but a fresh run_id.
    seedValidRun('rerun-after-v2', 'order',
        ['http_status' => 503, 'resource_id' => 50],
        ['http_status' => 200, 'resource_id' => 50],
    );

    // The new run does NOT update the existing comparison.
    $stored = ReplayComparison::find($comparisonId);

    expect($stored->after_run_id)->toBe('rerun-after')
        ->and($stored->before_run_id)->toBe('rerun-before');

    $this->assertDatabaseCount('replay_comparisons', 1);
});

// ── Existing unpaired runs remain unpaired ────────────────────────────────────

test('existing unpaired runs in history are not automatically associated', function () {
    seedValidRun('legacy-run-a', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedValidRun('legacy-run-b', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    // No ComparisonService::save was called.
    $this->assertDatabaseCount('replay_comparisons', 0);

    // Runs exist independently.
    expect(ReplayAttempt::where('run_id', 'legacy-run-a')->count())->toBe(2);
    expect(ReplayAttempt::where('run_id', 'legacy-run-b')->count())->toBe(2);
});
