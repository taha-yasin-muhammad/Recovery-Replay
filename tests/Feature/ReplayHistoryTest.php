<?php

use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

function seedRun(string $runId, string $resourceType, array $attempts): void
{
    foreach ($attempts as $index => $attempt) {
        $resourceId = $attempt['resource_id'] ?? ($index + 1);

        ReplayAttempt::create([
            'run_id' => $runId,
            'attempt_id' => $attempt['attempt_id'],
            'operation_id' => $attempt['operation_id'] ?? "op-{$runId}",
            'order_id' => $resourceType === 'order' ? $resourceId : null,
            'resource_type' => $resourceType,
            'resource_id' => $resourceId,
            'http_status' => $attempt['http_status'],
            'order_count_after' => $attempt['order_count_after'],
            'attempted_at' => $attempt['attempted_at'],
        ]);
    }
}

test('run history lists recent runs with evidence-backed metadata', function () {
    seedRun('run-list-a', 'order', [
        [
            'attempt_id' => 'attempt-a-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 10,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
        ],
        [
            'attempt_id' => 'attempt-a-2',
            'http_status' => 201,
            'order_count_after' => 2,
            'resource_id' => 11,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
        ],
    ]);

    seedRun('run-list-b', 'reservation', [
        [
            'attempt_id' => 'attempt-b-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 20,
            'attempted_at' => Carbon::parse('2026-09-21 12:00:00'),
        ],
        [
            'attempt_id' => 'attempt-b-2',
            'http_status' => 200,
            'order_count_after' => 1,
            'resource_id' => 20,
            'attempted_at' => Carbon::parse('2026-09-21 12:00:01'),
        ],
    ]);

    $response = $this->getJson('/api/replay-runs');

    $response->assertOk()
        ->assertJsonPath('meta.total', 2)
        ->assertJsonPath('data.0.run_id', 'run-list-b')
        ->assertJsonPath('data.0.resource_type', 'reservation')
        ->assertJsonPath('data.0.attempt_count', 2)
        ->assertJsonPath('data.0.resource_count', 1)
        ->assertJsonPath('data.0.safety_result', 'safe')
        ->assertJsonPath('data.1.run_id', 'run-list-a')
        ->assertJsonPath('data.1.resource_type', 'order')
        ->assertJsonPath('data.1.resource_count', 2)
        ->assertJsonPath('data.1.safety_result', 'unsafe');
});

test('run history supports exact run_id search', function () {
    seedRun('run-search-target', 'order', [
        [
            'attempt_id' => 'attempt-s-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'attempted_at' => now()->subMinute(),
        ],
        [
            'attempt_id' => 'attempt-s-2',
            'http_status' => 201,
            'order_count_after' => 1,
            'resource_id' => 1,
            'attempted_at' => now(),
        ],
    ]);

    seedRun('run-search-other', 'order', [
        [
            'attempt_id' => 'attempt-o-1',
            'http_status' => 201,
            'order_count_after' => 1,
            'attempted_at' => now(),
        ],
    ]);

    $response = $this->getJson('/api/replay-runs?run_id=run-search-target');

    $response->assertOk()
        ->assertJsonPath('meta.total', 1)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.run_id', 'run-search-target');

    $this->getJson('/api/replay-runs?run_id=run-search')
        ->assertOk()
        ->assertJsonPath('meta.total', 0)
        ->assertJsonCount(0, 'data');
});

test('run history paginates recent runs', function () {
    for ($i = 1; $i <= 3; $i++) {
        seedRun("run-page-{$i}", 'order', [
            [
                'attempt_id' => "attempt-page-{$i}",
                'http_status' => 201,
                'order_count_after' => 1,
                'attempted_at' => Carbon::parse('2026-09-20 10:00:0'.$i),
            ],
        ]);
    }

    $page1 = $this->getJson('/api/replay-runs?per_page=2&page=1');
    $page1->assertOk()
        ->assertJsonPath('meta.per_page', 2)
        ->assertJsonPath('meta.current_page', 1)
        ->assertJsonPath('meta.last_page', 2)
        ->assertJsonPath('meta.total', 3)
        ->assertJsonCount(2, 'data');

    $page2 = $this->getJson('/api/replay-runs?per_page=2&page=2');
    $page2->assertOk()
        ->assertJsonPath('meta.current_page', 2)
        ->assertJsonCount(1, 'data');
});

test('missing historical run returns 404', function () {
    $this->getJson('/api/replay-runs/does-not-exist')
        ->assertNotFound()
        ->assertJsonPath('run_id', 'does-not-exist');
});

test('historical run show isolates evidence to the requested run', function () {
    $orderA = Order::create(['operation_id' => 'op-iso-a', 'status' => 'pending']);
    $orderB = Order::create(['operation_id' => 'op-iso-b', 'status' => 'pending']);

    ReplayAttempt::create([
        'run_id' => 'run-iso-a',
        'attempt_id' => 'attempt-iso-a',
        'operation_id' => 'op-iso-a',
        'order_id' => $orderA->id,
        'resource_type' => 'order',
        'resource_id' => $orderA->id,
        'http_status' => 201,
        'order_count_after' => 1,
        'attempted_at' => now(),
    ]);

    ReplayAttempt::create([
        'run_id' => 'run-iso-b',
        'attempt_id' => 'attempt-iso-b',
        'operation_id' => 'op-iso-b',
        'order_id' => $orderB->id,
        'resource_type' => 'order',
        'resource_id' => $orderB->id,
        'http_status' => 201,
        'order_count_after' => 1,
        'attempted_at' => now(),
    ]);

    $response = $this->getJson('/api/replay-runs/run-iso-a');

    $response->assertOk()
        ->assertJsonPath('run_id', 'run-iso-a')
        ->assertJsonCount(1, 'attempts')
        ->assertJsonCount(1, 'orders')
        ->assertJsonPath('attempts.0.run_id', 'run-iso-a')
        ->assertJsonPath('orders.0.id', $orderA->id)
        ->assertJsonMissing(['id' => $orderB->id]);

    expect(collect($response->json('attempts'))->pluck('run_id')->unique()->all())
        ->toBe(['run-iso-a']);
});

test('incomplete historical evidence is marked inconclusive', function () {
    seedRun('run-incomplete', 'order', [
        [
            'attempt_id' => 'attempt-only',
            'http_status' => 503,
            'order_count_after' => 1,
            'attempted_at' => now(),
        ],
    ]);

    $this->getJson('/api/replay-runs/run-incomplete')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', true)
        ->assertJsonPath('summary.safety_result', 'inconclusive')
        ->assertJsonPath('summary.operation_safe', false)
        ->assertJsonPath('summary.reproduction_succeeded', false);
});

test('extra historical attempt rows are marked inconclusive', function () {
    seedRun('run-extra', 'order', [
        [
            'attempt_id' => 'attempt-extra-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 1,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
        ],
        [
            'attempt_id' => 'attempt-extra-2',
            'http_status' => 201,
            'order_count_after' => 1,
            'resource_id' => 1,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
        ],
        [
            'attempt_id' => 'attempt-extra-3',
            'http_status' => 201,
            'order_count_after' => 1,
            'resource_id' => 1,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:02'),
        ],
    ]);

    $this->getJson('/api/replay-runs/run-extra')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', true)
        ->assertJsonPath('summary.safety_result', 'inconclusive')
        ->assertJsonPath('summary.operation_safe', false)
        ->assertJsonPath('summary.resource_count', 0)
        ->assertJsonPath('summary.resource_ids', []);
});

test('list and detail summaries agree for protected and vulnerable historical runs', function () {
    seedRun('run-agree-safe', 'order', [
        [
            'attempt_id' => 'attempt-agree-s-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 30,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
        ],
        [
            'attempt_id' => 'attempt-agree-s-2',
            'http_status' => 200,
            'order_count_after' => 1,
            'resource_id' => 30,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
        ],
    ]);

    seedRun('run-agree-unsafe', 'order', [
        [
            'attempt_id' => 'attempt-agree-u-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 40,
            'attempted_at' => Carbon::parse('2026-09-20 11:00:00'),
        ],
        [
            'attempt_id' => 'attempt-agree-u-2',
            'http_status' => 201,
            'order_count_after' => 2,
            'resource_id' => 41,
            'attempted_at' => Carbon::parse('2026-09-20 11:00:01'),
        ],
    ]);

    $list = $this->getJson('/api/replay-runs');
    $list->assertOk();

    $safeList = collect($list->json('data'))->firstWhere('run_id', 'run-agree-safe');
    $unsafeList = collect($list->json('data'))->firstWhere('run_id', 'run-agree-unsafe');

    expect($safeList['safety_result'])->toBe('safe')
        ->and($safeList['operation_safe'])->toBeTrue();
    expect($unsafeList['safety_result'])->toBe('unsafe')
        ->and($unsafeList['operation_safe'])->toBeFalse();

    $this->getJson('/api/replay-runs/run-agree-safe')
        ->assertOk()
        ->assertJsonPath('summary.safety_result', $safeList['safety_result'])
        ->assertJsonPath('summary.operation_safe', $safeList['operation_safe'])
        ->assertJsonPath('summary.resource_ids', $safeList['resource_ids']);

    $this->getJson('/api/replay-runs/run-agree-unsafe')
        ->assertOk()
        ->assertJsonPath('summary.safety_result', $unsafeList['safety_result'])
        ->assertJsonPath('summary.operation_safe', $unsafeList['operation_safe'])
        ->assertJsonPath('summary.resource_ids', $unsafeList['resource_ids']);
});

test('missing historical resource_id is marked inconclusive even when order_id is present', function () {
    ReplayAttempt::create([
        'run_id' => 'run-missing-rid',
        'attempt_id' => 'attempt-m-1',
        'operation_id' => 'op-missing-rid',
        'order_id' => 7,
        'resource_type' => 'order',
        'resource_id' => null,
        'http_status' => 503,
        'order_count_after' => 1,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
    ]);

    ReplayAttempt::create([
        'run_id' => 'run-missing-rid',
        'attempt_id' => 'attempt-m-2',
        'operation_id' => 'op-missing-rid',
        'order_id' => 7,
        'resource_type' => 'order',
        'resource_id' => null,
        'http_status' => 201,
        'order_count_after' => 1,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
    ]);

    $this->getJson('/api/replay-runs/run-missing-rid')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', true)
        ->assertJsonPath('summary.safety_result', 'inconclusive')
        ->assertJsonPath('summary.operation_safe', false)
        ->assertJsonPath('summary.same_resource_on_retry', false)
        ->assertJsonPath('summary.resource_ids', []);
});

test('inconsistent historical resource_type is marked inconclusive', function () {
    ReplayAttempt::create([
        'run_id' => 'run-mixed-type',
        'attempt_id' => 'attempt-t-1',
        'operation_id' => 'op-mixed-type',
        'order_id' => 5,
        'resource_type' => 'order',
        'resource_id' => 5,
        'http_status' => 503,
        'order_count_after' => 1,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
    ]);

    ReplayAttempt::create([
        'run_id' => 'run-mixed-type',
        'attempt_id' => 'attempt-t-2',
        'operation_id' => 'op-mixed-type',
        'order_id' => null,
        'resource_type' => 'reservation',
        'resource_id' => 5,
        'http_status' => 200,
        'order_count_after' => 1,
        'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
    ]);

    $this->getJson('/api/replay-runs/run-mixed-type')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', true)
        ->assertJsonPath('summary.safety_result', 'inconclusive')
        ->assertJsonPath('summary.resource_type', null)
        ->assertJsonPath('summary.operation_safe', false);
});

test('unexpected historical HTTP sequence with complete identity is inconclusive not unsafe', function () {
    seedRun('run-http-odd', 'order', [
        [
            'attempt_id' => 'attempt-h-1',
            'http_status' => 201,
            'order_count_after' => 1,
            'resource_id' => 8,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
        ],
        [
            'attempt_id' => 'attempt-h-2',
            'http_status' => 201,
            'order_count_after' => 1,
            'resource_id' => 9,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
        ],
    ]);

    $this->getJson('/api/replay-runs/run-http-odd')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', false)
        ->assertJsonPath('summary.safety_result', 'inconclusive')
        ->assertJsonPath('summary.operation_safe', false)
        ->assertJsonPath('summary.reproduction_succeeded', false)
        ->assertJsonPath('summary.duplicate_resources', true)
        ->assertJsonPath('summary.resource_count', 2);
});

test('protected historical run with same resource_id is safe', function () {
    seedRun('run-protected-hist', 'order', [
        [
            'attempt_id' => 'attempt-p-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 42,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
        ],
        [
            'attempt_id' => 'attempt-p-2',
            'http_status' => 200,
            'order_count_after' => 1,
            'resource_id' => 42,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
        ],
    ]);

    $this->getJson('/api/replay-runs/run-protected-hist')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', false)
        ->assertJsonPath('summary.safety_result', 'safe')
        ->assertJsonPath('summary.operation_safe', true)
        ->assertJsonPath('summary.reproduction_succeeded', true)
        ->assertJsonPath('summary.same_resource_on_retry', true)
        ->assertJsonPath('summary.resource_count', 1);
});

test('vulnerable historical run with distinct resource_ids is unsafe', function () {
    seedRun('run-vulnerable-hist', 'reservation', [
        [
            'attempt_id' => 'attempt-v-1',
            'http_status' => 503,
            'order_count_after' => 1,
            'resource_id' => 10,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:00'),
        ],
        [
            'attempt_id' => 'attempt-v-2',
            'http_status' => 201,
            'order_count_after' => 2,
            'resource_id' => 11,
            'attempted_at' => Carbon::parse('2026-09-20 10:00:01'),
        ],
    ]);

    $this->getJson('/api/replay-runs/run-vulnerable-hist')
        ->assertOk()
        ->assertJsonPath('summary.incomplete', false)
        ->assertJsonPath('summary.safety_result', 'unsafe')
        ->assertJsonPath('summary.operation_safe', false)
        ->assertJsonPath('summary.reproduction_succeeded', true)
        ->assertJsonPath('summary.duplicate_resources', true)
        ->assertJsonPath('summary.resource_count', 2);
});

test('run history endpoints are forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $this->getJson('/api/replay-runs')->assertForbidden();
    $this->getJson('/api/replay-runs/any-run')->assertForbidden();
});

test('history page is accessible in testing and forbidden in production', function () {
    $this->withoutVite();

    $this->get('/demo/history')
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('history'));

    $this->app->detectEnvironment(fn () => 'production');

    $this->get('/demo/history')->assertForbidden();
});
