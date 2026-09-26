<?php

use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

// Protected checkout mode: idempotency prevents duplicate orders on retry.

test('vulnerable mode still creates two orders on retry', function () {
    $this->postJson('/api/checkout', [
        'operation_id' => 'op-vuln-1',
        'inject_fault' => true,
    ])->assertStatus(503);

    $this->postJson('/api/checkout', [
        'operation_id' => 'op-vuln-1',
        'inject_fault' => false,
    ])->assertStatus(201);

    $this->assertDatabaseCount('orders', 2);
});

test('protected mode creates exactly one order even after a 503', function () {
    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-prot-1',
        'idempotency_key' => 'idem-prot-1',
        'inject_fault' => true,
    ])->assertStatus(503);

    $this->assertDatabaseCount('orders', 1);

    $retry = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-prot-1',
        'idempotency_key' => 'idem-prot-1',
        'inject_fault' => false,
    ]);

    $retry->assertStatus(200);

    // Still only one order.
    $this->assertDatabaseCount('orders', 1);
});

test('both protected attempts reference the same order', function () {
    $runId = 'run-prot-same-order';
    $operationId = 'op-prot-same';
    $idempotencyKey = 'idem-same-order';

    $first = $this->postJson('/api/checkout/protected', [
        'operation_id' => $operationId,
        'idempotency_key' => $idempotencyKey,
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'attempt-prot-1',
    ]);

    $first->assertStatus(503);
    $firstOrderId = Order::where('idempotency_key', $idempotencyKey)->value('id');

    $second = $this->postJson('/api/checkout/protected', [
        'operation_id' => $operationId,
        'idempotency_key' => $idempotencyKey,
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'attempt-prot-2',
    ]);

    $second->assertStatus(200)
        ->assertJsonFragment(['order_id' => $firstOrderId]);

    // Both replay attempt records reference the same order.
    $attempts = ReplayAttempt::where('run_id', $runId)->get();
    expect($attempts)->toHaveCount(2);
    expect($attempts->pluck('order_id')->unique()->count())->toBe(1);
    expect($attempts->first()->order_id)->toBe($firstOrderId);
});

test('different idempotency keys create separate orders', function () {
    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-diff-keys',
        'idempotency_key' => 'idem-key-a',
    ])->assertStatus(201);

    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-diff-keys',
        'idempotency_key' => 'idem-key-b',
    ])->assertStatus(201);

    $this->assertDatabaseCount('orders', 2);
});

test('first protected attempt returns 503 but persists the order', function () {
    $response = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-prot-fault',
        'idempotency_key' => 'idem-prot-fault',
        'inject_fault' => true,
    ]);

    $response->assertStatus(503);
    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseHas('orders', ['idempotency_key' => 'idem-prot-fault']);
});

test('retry with same idempotency key returns HTTP 200 with existing order data', function () {
    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-prot-200',
        'idempotency_key' => 'idem-prot-200',
        'inject_fault' => true,
    ])->assertStatus(503);

    $orderId = Order::where('idempotency_key', 'idem-prot-200')->value('id');

    $retry = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-prot-200',
        'idempotency_key' => 'idem-prot-200',
    ]);

    $retry->assertStatus(200)
        ->assertJsonFragment(['order_id' => $orderId, 'status' => 'pending']);
});

test('protected attempt records replay evidence for both attempts under the same run', function () {
    $runId = 'run-prot-evidence';
    $operationId = 'op-prot-evidence';
    $idempotencyKey = 'idem-evidence';

    $this->postJson('/api/checkout/protected', [
        'operation_id' => $operationId,
        'idempotency_key' => $idempotencyKey,
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'prot-attempt-1',
    ])->assertStatus(503);

    $this->postJson('/api/checkout/protected', [
        'operation_id' => $operationId,
        'idempotency_key' => $idempotencyKey,
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'prot-attempt-2',
    ])->assertStatus(200);

    $this->assertDatabaseCount('replay_attempts', 2);

    $attempts = ReplayAttempt::where('run_id', $runId)->orderBy('attempted_at')->get();

    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(200);

    // Both attempts point to the same order.
    expect($attempts[0]->order_id)->toBe($attempts[1]->order_id);

    // order_count_after is 1 for both since no duplicate was created.
    expect($attempts[0]->order_count_after)->toBe(1);
    expect($attempts[1]->order_count_after)->toBe(1);
});

// Idempotency key conflict: same key, different operation_id

test('reusing an idempotency key for a different operation_id returns 409', function () {
    // First request establishes the key against operation A.
    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-original',
        'idempotency_key' => 'idem-shared-key',
    ])->assertStatus(201);

    // Second request reuses the same key for a completely different operation.
    $response = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-different',
        'idempotency_key' => 'idem-shared-key',
    ]);

    $response->assertStatus(409)
        ->assertJsonFragment(['message' => 'This idempotency key was used for a different operation.']);

    // No second order was created.
    $this->assertDatabaseCount('orders', 1);
});

test('legitimate retry with matching operation_id still returns 200', function () {
    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-retry',
        'idempotency_key' => 'idem-retry-key',
        'inject_fault' => true,
    ])->assertStatus(503);

    // Retry with the same operation_id — must succeed idempotently.
    $retry = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-retry',
        'idempotency_key' => 'idem-retry-key',
    ]);

    $retry->assertStatus(200);
    $this->assertDatabaseCount('orders', 1);
});

test('409 response does not record replay evidence', function () {
    $runId = 'run-conflict-evidence';

    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-original-ev',
        'idempotency_key' => 'idem-conflict-ev',
        'run_id' => $runId,
        'attempt_id' => 'attempt-1',
    ])->assertStatus(201);

    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-conflicting-ev',
        'idempotency_key' => 'idem-conflict-ev',
        'run_id' => $runId,
        'attempt_id' => 'attempt-2',
    ])->assertStatus(409);

    // Only the first (successful) attempt was recorded.
    $this->assertDatabaseCount('replay_attempts', 1);
    $this->assertDatabaseHas('replay_attempts', ['attempt_id' => 'attempt-1']);
    $this->assertDatabaseMissing('replay_attempts', ['attempt_id' => 'attempt-2']);
});

test('409 does not create a second order', function () {
    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-a',
        'idempotency_key' => 'idem-once',
    ])->assertStatus(201);

    $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-b',
        'idempotency_key' => 'idem-once',
    ])->assertStatus(409);

    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseHas('orders', ['operation_id' => 'op-a']);
    $this->assertDatabaseMissing('orders', ['operation_id' => 'op-b']);
});

// Unique-constraint conflict path: lookup missed, insert lost the race.
// Deterministic simulation via Order::creating — not a live concurrency stress test.

test('unique-constraint conflict path records replay evidence for a matching retry', function () {
    $runId = 'run-checkout-unique-ev';
    $operationId = 'op-checkout-unique-ev';
    $idempotencyKey = 'idem-checkout-unique-ev';

    Order::creating(function (Order $order) use ($idempotencyKey, $operationId): void {
        if ($order->idempotency_key !== $idempotencyKey) {
            return;
        }

        static $injected = false;

        if ($injected) {
            return;
        }

        $injected = true;

        // Competing row wins the unique key before this insert commits.
        DB::table('orders')->insert([
            'operation_id' => $operationId,
            'idempotency_key' => $idempotencyKey,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    });

    try {
        $response = $this->postJson('/api/checkout/protected', [
            'operation_id' => $operationId,
            'idempotency_key' => $idempotencyKey,
            'run_id' => $runId,
            'attempt_id' => 'unique-attempt-1',
        ]);

        $response->assertStatus(200);

        $orderId = Order::where('idempotency_key', $idempotencyKey)->value('id');

        $response->assertJsonFragment(['order_id' => $orderId, 'status' => 'pending']);

        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseHas('replay_attempts', [
            'run_id' => $runId,
            'attempt_id' => 'unique-attempt-1',
            'operation_id' => $operationId,
            'order_id' => $orderId,
            'resource_type' => 'order',
            'resource_id' => $orderId,
            'http_status' => 200,
        ]);
    } finally {
        Order::flushEventListeners();
    }
});

test('unique-constraint conflict path returns 409 without evidence when operation_id differs', function () {
    $runId = 'run-checkout-unique-409';
    $idempotencyKey = 'idem-checkout-unique-409';

    Order::creating(function (Order $order) use ($idempotencyKey): void {
        if ($order->idempotency_key !== $idempotencyKey) {
            return;
        }

        static $injected = false;

        if ($injected) {
            return;
        }

        $injected = true;

        DB::table('orders')->insert([
            'operation_id' => 'op-winner-other',
            'idempotency_key' => $idempotencyKey,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    });

    try {
        $response = $this->postJson('/api/checkout/protected', [
            'operation_id' => 'op-loser',
            'idempotency_key' => $idempotencyKey,
            'run_id' => $runId,
            'attempt_id' => 'unique-conflict-attempt',
        ]);

        $response->assertStatus(409)
            ->assertJsonFragment(['message' => 'This idempotency key was used for a different operation.']);

        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseHas('orders', ['operation_id' => 'op-winner-other']);
        $this->assertDatabaseCount('replay_attempts', 0);
    } finally {
        Order::flushEventListeners();
    }
});
