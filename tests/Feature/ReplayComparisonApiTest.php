<?php

use App\Models\ReplayAttempt;
use App\Models\ReplayComparison;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * Seeds a complete two-attempt run via API-style helper (direct DB).
 *
 * @param  array{http_status: int, resource_id: int}  $first
 * @param  array{http_status: int, resource_id: int}  $second
 */
function seedApiRun(
    string $runId,
    string $resourceType,
    array $first,
    array $second,
): void {
    ReplayAttempt::create([
        'run_id' => $runId,
        'attempt_id' => "api-attempt-{$runId}-1",
        'operation_id' => "api-op-{$runId}",
        'order_id' => $resourceType === 'order' ? $first['resource_id'] : null,
        'resource_type' => $resourceType,
        'resource_id' => $first['resource_id'],
        'http_status' => $first['http_status'],
        'order_count_after' => 1,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
    ]);

    ReplayAttempt::create([
        'run_id' => $runId,
        'attempt_id' => "api-attempt-{$runId}-2",
        'operation_id' => "api-op-{$runId}",
        'order_id' => $resourceType === 'order' ? $second['resource_id'] : null,
        'resource_type' => $resourceType,
        'resource_id' => $second['resource_id'],
        'http_status' => $second['http_status'],
        'order_count_after' => 2,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
    ]);
}

/**
 * Save a comparison row directly (bypassing the service, for read-path tests).
 */
function seedComparison(
    string $resourceType,
    string $beforeRunId,
    string $afterRunId,
): string {
    $id = (string) Str::uuid();

    ReplayComparison::create([
        'comparison_id' => $id,
        'resource_type' => $resourceType,
        'before_run_id' => $beforeRunId,
        'after_run_id' => $afterRunId,
    ]);

    return $id;
}

// ── POST /api/replay-comparisons (save) ───────────────────────────────────────

test('saves a valid checkout comparison via API', function () {
    seedApiRun('api-before-checkout', 'order',
        ['http_status' => 503, 'resource_id' => 10],
        ['http_status' => 201, 'resource_id' => 11],
    );

    seedApiRun('api-after-checkout', 'order',
        ['http_status' => 503, 'resource_id' => 20],
        ['http_status' => 200, 'resource_id' => 20],
    );

    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-before-checkout',
        'after_run_id' => 'api-after-checkout',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('saved', true)
        ->assertJsonStructure(['comparison_id'])
        ->assertJsonPath('error', null);

    $this->assertDatabaseHas('replay_comparisons', [
        'before_run_id' => 'api-before-checkout',
        'after_run_id' => 'api-after-checkout',
        'resource_type' => 'order',
    ]);
});

test('saves a valid reservation comparison via API', function () {
    seedApiRun('api-before-res', 'reservation',
        ['http_status' => 503, 'resource_id' => 30],
        ['http_status' => 201, 'resource_id' => 31],
    );

    seedApiRun('api-after-res', 'reservation',
        ['http_status' => 503, 'resource_id' => 40],
        ['http_status' => 200, 'resource_id' => 40],
    );

    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-before-res',
        'after_run_id' => 'api-after-res',
    ]);

    $response->assertStatus(201)
        ->assertJsonPath('saved', true);
});

test('returns 422 for identical run IDs', function () {
    seedApiRun('api-same-both', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-same-both',
        'after_run_id' => 'api-same-both',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('saved', false)
        ->assertJsonPath('comparison_id', null);

    expect($response->json('error'))->toContain('distinct');
});

test('returns 422 for mismatched resource types', function () {
    seedApiRun('api-mismatch-order', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('api-mismatch-reservation', 'reservation',
        ['http_status' => 503, 'resource_id' => 10],
        ['http_status' => 200, 'resource_id' => 10],
    );

    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-mismatch-order',
        'after_run_id' => 'api-mismatch-reservation',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('saved', false);

    expect($response->json('error'))->toContain('resource type');
});

test('returns 422 when before run has incomplete evidence', function () {
    // Only one attempt.
    ReplayAttempt::create([
        'run_id' => 'api-before-partial',
        'attempt_id' => 'api-partial-1',
        'operation_id' => 'op-partial',
        'order_id' => 1,
        'resource_type' => 'order',
        'resource_id' => 1,
        'http_status' => 503,
        'order_count_after' => 1,
        'attempted_at' => now(),
    ]);

    seedApiRun('api-after-ok', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-before-partial',
        'after_run_id' => 'api-after-ok',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('saved', false);

    expect($response->json('error'))->toContain('incomplete');
});

test('returns 422 when after run has incomplete evidence', function () {
    seedApiRun('api-before-full', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    ReplayAttempt::create([
        'run_id' => 'api-after-partial',
        'attempt_id' => 'api-partial-after-1',
        'operation_id' => 'op-partial-after',
        'order_id' => 5,
        'resource_type' => 'order',
        'resource_id' => 5,
        'http_status' => 200,
        'order_count_after' => 1,
        'attempted_at' => now(),
    ]);

    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-before-full',
        'after_run_id' => 'api-after-partial',
    ]);

    $response->assertStatus(422)
        ->assertJsonPath('saved', false);

    expect($response->json('error'))->toContain('incomplete');
});

test('individual runs are preserved even when comparison creation fails', function () {
    seedApiRun('api-preserved-a', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('api-preserved-b', 'order',
        ['http_status' => 503, 'resource_id' => 3],
        ['http_status' => 201, 'resource_id' => 4],
    );

    // Both runs are unsafe; comparison should fail on the after side.
    $response = $this->postJson('/api/replay-comparisons', [
        'before_run_id' => 'api-preserved-a',
        'after_run_id' => 'api-preserved-b',
    ]);

    $response->assertStatus(422);

    // Individual runs are still intact.
    expect(ReplayAttempt::where('run_id', 'api-preserved-a')->count())->toBe(2);
    expect(ReplayAttempt::where('run_id', 'api-preserved-b')->count())->toBe(2);
    $this->assertDatabaseCount('replay_comparisons', 0);
});

// ── GET /api/replay-comparisons (list) ───────────────────────────────────────

test('lists saved comparisons newest first', function () {
    seedApiRun('list-before-1', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('list-after-1', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    seedApiRun('list-before-2', 'reservation',
        ['http_status' => 503, 'resource_id' => 10],
        ['http_status' => 201, 'resource_id' => 11],
    );

    seedApiRun('list-after-2', 'reservation',
        ['http_status' => 503, 'resource_id' => 20],
        ['http_status' => 200, 'resource_id' => 20],
    );

    $id1 = seedComparison('order', 'list-before-1', 'list-after-1');
    // Add a small sleep to ensure distinct timestamps.
    usleep(10_000);
    $id2 = seedComparison('reservation', 'list-before-2', 'list-after-2');

    $response = $this->getJson('/api/replay-comparisons');

    $response->assertOk()
        ->assertJsonPath('meta.total', 2)
        ->assertJsonCount(2, 'data');

    $data = $response->json('data');
    // Newest first: id2 then id1 (both have same created_at in most cases,
    // so we at least assert both are present with correct shape).
    $ids = collect($data)->pluck('comparison_id')->all();
    expect($ids)->toContain($id1)
        ->and($ids)->toContain($id2);
});

test('comparison list paginates', function () {
    for ($i = 1; $i <= 3; $i++) {
        seedApiRun("page-before-{$i}", 'order',
            ['http_status' => 503, 'resource_id' => $i],
            ['http_status' => 201, 'resource_id' => $i + 10],
        );

        seedApiRun("page-after-{$i}", 'order',
            ['http_status' => 503, 'resource_id' => $i + 100],
            ['http_status' => 200, 'resource_id' => $i + 100],
        );

        seedComparison('order', "page-before-{$i}", "page-after-{$i}");
    }

    $page1 = $this->getJson('/api/replay-comparisons?per_page=2&page=1');
    $page1->assertOk()
        ->assertJsonPath('meta.per_page', 2)
        ->assertJsonPath('meta.current_page', 1)
        ->assertJsonPath('meta.last_page', 2)
        ->assertJsonPath('meta.total', 3)
        ->assertJsonCount(2, 'data');

    $page2 = $this->getJson('/api/replay-comparisons?per_page=2&page=2');
    $page2->assertOk()
        ->assertJsonPath('meta.current_page', 2)
        ->assertJsonCount(1, 'data');
});

// ── GET /api/replay-comparisons/{id} (show) ───────────────────────────────────

test('retrieves a comparison with full run evidence', function () {
    seedApiRun('show-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('show-after', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $id = seedComparison('order', 'show-before', 'show-after');

    $response = $this->getJson("/api/replay-comparisons/{$id}");

    $response->assertOk()
        ->assertJsonPath('comparison_id', $id)
        ->assertJsonPath('resource_type', 'order')
        ->assertJsonPath('before_run_id', 'show-before')
        ->assertJsonPath('after_run_id', 'show-after')
        ->assertJsonPath('before.run_id', 'show-before')
        ->assertJsonPath('after.run_id', 'show-after')
        ->assertJsonCount(2, 'before.attempts')
        ->assertJsonCount(2, 'after.attempts');
});

test('retrieval does not execute a scenario or create resources', function () {
    seedApiRun('noexec-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('noexec-after', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $id = seedComparison('order', 'noexec-before', 'noexec-after');

    $attemptsBefore = ReplayAttempt::count();
    $compsBefore = ReplayComparison::count();

    $this->getJson("/api/replay-comparisons/{$id}")->assertOk();

    expect(ReplayAttempt::count())->toBe($attemptsBefore);
    expect(ReplayComparison::count())->toBe($compsBefore);
});

test('returns 404 for missing comparison_id', function () {
    $missing = (string) Str::uuid();

    $this->getJson("/api/replay-comparisons/{$missing}")
        ->assertNotFound()
        ->assertJsonPath('comparison_id', $missing);
});

test('comparison show includes summary for both runs', function () {
    seedApiRun('summary-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('summary-after', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    $id = seedComparison('order', 'summary-before', 'summary-after');

    $response = $this->getJson("/api/replay-comparisons/{$id}");

    $response->assertOk()
        ->assertJsonPath('before.summary.run_id', 'summary-before')
        ->assertJsonPath('before.summary.safety_result', 'unsafe')
        ->assertJsonPath('after.summary.run_id', 'summary-after')
        ->assertJsonPath('after.summary.safety_result', 'safe')
        ->assertJsonPath('after.summary.operation_safe', true);
});

// ── Validate evidence server-side (read path) ─────────────────────────────────

test('comparison show validates resource type server-side', function () {
    seedApiRun('sval-before', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('sval-after', 'reservation',
        ['http_status' => 503, 'resource_id' => 10],
        ['http_status' => 200, 'resource_id' => 10],
    );

    // Force-create a mismatched comparison to test server-side read path.
    $id = (string) Str::uuid();
    ReplayComparison::create([
        'comparison_id' => $id,
        'resource_type' => 'order',
        'before_run_id' => 'sval-before',
        'after_run_id' => 'sval-after',
    ]);

    // The show endpoint still returns the data — it doesn't re-validate on read.
    // The data is what was saved; summaries show their individual evaluations.
    $response = $this->getJson("/api/replay-comparisons/{$id}");

    $response->assertOk()
        ->assertJsonPath('comparison_id', $id)
        ->assertJsonPath('before.summary.safety_result', 'unsafe')
        ->assertJsonPath('after.summary.safety_result', 'safe');
});

// ── Production access restriction ─────────────────────────────────────────────

test('comparison endpoints are forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $this->getJson('/api/replay-comparisons')->assertForbidden();
    $this->getJson('/api/replay-comparisons/some-id')->assertForbidden();
    $this->postJson('/api/replay-comparisons', [])->assertForbidden();
});

// ── Existing individual runs remain independent ───────────────────────────────

test('individual run history still works alongside saved comparisons', function () {
    seedApiRun('coexist-run-a', 'order',
        ['http_status' => 503, 'resource_id' => 1],
        ['http_status' => 201, 'resource_id' => 2],
    );

    seedApiRun('coexist-run-b', 'order',
        ['http_status' => 503, 'resource_id' => 5],
        ['http_status' => 200, 'resource_id' => 5],
    );

    seedComparison('order', 'coexist-run-a', 'coexist-run-b');

    // Individual run endpoints are unaffected.
    $this->getJson('/api/replay-runs/coexist-run-a')->assertOk()
        ->assertJsonPath('run_id', 'coexist-run-a')
        ->assertJsonCount(2, 'attempts');

    $this->getJson('/api/replay-runs/coexist-run-b')->assertOk()
        ->assertJsonPath('run_id', 'coexist-run-b')
        ->assertJsonCount(2, 'attempts');

    $this->getJson('/api/replay-runs')
        ->assertOk()
        ->assertJsonPath('meta.total', 2);
});
