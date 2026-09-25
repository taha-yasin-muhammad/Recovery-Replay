<?php

use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// Scenario: two checkout attempts share a run_id so their evidence can be
// retrieved together and shows the full picture of the duplicate-order bug.

test('both attempts belong to the same run and evidence is recorded correctly', function () {
    $runId = 'run-evidence-001';
    $operationId = 'op-evidence-abc';

    // First attempt: persists order then faults.
    $first = $this->postJson('/api/checkout', [
        'operation_id' => $operationId,
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'attempt-1',
    ]);

    $first->assertStatus(503);

    // Second attempt: succeeds (duplicate order created — no idempotency yet).
    $second = $this->postJson('/api/checkout', [
        'operation_id' => $operationId,
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'attempt-2',
    ]);

    $second->assertStatus(201);

    // Two real orders exist in the database.
    $this->assertDatabaseCount('orders', 2);

    // Two attempt records were recorded under the same run.
    $this->assertDatabaseCount('replay_attempts', 2);

    $attempts = ReplayAttempt::where('run_id', $runId)->orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);

    // Both attempts share the run_id.
    expect($attempts[0]->run_id)->toBe($runId);
    expect($attempts[1]->run_id)->toBe($runId);

    // Attempt IDs are distinct.
    expect($attempts[0]->attempt_id)->toBe('attempt-1');
    expect($attempts[1]->attempt_id)->toBe('attempt-2');

    // First attempt recorded HTTP 503.
    expect($attempts[0]->http_status)->toBe(503);

    // Second attempt recorded HTTP 201.
    expect($attempts[1]->http_status)->toBe(201);

    // order_count_after reflects the running total per operation.
    expect($attempts[0]->order_count_after)->toBe(1);
    expect($attempts[1]->order_count_after)->toBe(2);
});

test('replay endpoint returns the recorded attempts and associated orders', function () {
    $runId = 'run-endpoint-001';
    $operationId = 'op-endpoint-abc';

    $this->postJson('/api/checkout', [
        'operation_id' => $operationId,
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'attempt-a',
    ])->assertStatus(503);

    $this->postJson('/api/checkout', [
        'operation_id' => $operationId,
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'attempt-b',
    ])->assertStatus(201);

    $response = $this->getJson("/api/replay-runs/{$runId}");

    $response->assertStatus(200)
        ->assertJsonFragment(['run_id' => $runId])
        ->assertJsonCount(2, 'attempts')
        ->assertJsonCount(2, 'orders');

    // The real HTTP statuses are present in the response payload.
    $data = $response->json();

    $statuses = collect($data['attempts'])->pluck('http_status')->sort()->values()->all();
    expect($statuses)->toBe([201, 503]);

    // Both orders are real database rows.
    $orderIds = collect($data['orders'])->pluck('id')->sort()->values()->all();
    expect(Order::whereIn('id', $orderIds)->count())->toBe(2);
});
