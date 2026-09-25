<?php

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// Scenario: customer submits checkout → server persists order → returns 503.
// On retry (no idempotency protection) a second order is created.

test('checkout with fault injection returns 503 but persists the order', function () {
    $response = $this->postJson('/api/checkout', [
        'operation_id' => 'op-abc-123',
        'inject_fault' => true,
    ]);

    $response->assertStatus(503);
    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseHas('orders', ['operation_id' => 'op-abc-123']);
});

test('retrying the same operation without idempotency creates a second order', function () {
    // First attempt: persists an order then returns 503.
    $this->postJson('/api/checkout', [
        'operation_id' => 'op-abc-123',
        'inject_fault' => true,
    ])->assertStatus(503);

    $this->assertDatabaseCount('orders', 1);

    // Customer retries the same logical operation.
    $retry = $this->postJson('/api/checkout', [
        'operation_id' => 'op-abc-123',
        'inject_fault' => false,
    ]);

    $retry->assertStatus(201);

    // Without idempotency protection a duplicate order is created.
    $this->assertDatabaseCount('orders', 2);
    $this->assertDatabaseHas('orders', ['operation_id' => 'op-abc-123', 'status' => 'pending']);
});

test('successful checkout without fault returns 201 and order data', function () {
    $response = $this->postJson('/api/checkout', [
        'operation_id' => 'op-xyz-789',
    ]);

    $response->assertStatus(201)
        ->assertJsonStructure(['order_id', 'status'])
        ->assertJsonFragment(['status' => 'pending']);

    $this->assertDatabaseCount('orders', 1);
});
