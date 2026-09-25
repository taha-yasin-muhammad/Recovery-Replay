<?php

use App\Models\Order;
use App\Models\Reservation;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Injected 503 responses must stay concise JSON — no exception class, file,
 * line, or stack trace — while still persisting the resource and recording
 * evidence when a run_id is supplied.
 */
$faultPayload = [
    'message' => 'Simulated server fault after persistence',
    'error' => 'service_unavailable',
];

test('checkout fault returns structured json without exception payload', function () use ($faultPayload) {
    $response = $this->postJson('/api/checkout', [
        'operation_id' => 'op-fault-checkout',
        'inject_fault' => true,
        'run_id' => 'run-fault-checkout',
        'attempt_id' => 'attempt-fault-checkout',
    ]);

    $response->assertStatus(503)
        ->assertExactJson($faultPayload)
        ->assertJsonMissingPath('exception')
        ->assertJsonMissingPath('file')
        ->assertJsonMissingPath('line')
        ->assertJsonMissingPath('trace');

    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseHas('replay_attempts', [
        'run_id' => 'run-fault-checkout',
        'http_status' => 503,
        'resource_type' => 'order',
    ]);
});

test('protected checkout fault returns structured json without exception payload', function () use ($faultPayload) {
    $response = $this->postJson('/api/checkout/protected', [
        'operation_id' => 'op-fault-prot-checkout',
        'idempotency_key' => 'idem-fault-prot-checkout',
        'inject_fault' => true,
        'run_id' => 'run-fault-prot-checkout',
        'attempt_id' => 'attempt-fault-prot-checkout',
    ]);

    $response->assertStatus(503)
        ->assertExactJson($faultPayload)
        ->assertJsonMissingPath('exception')
        ->assertJsonMissingPath('trace');

    expect(Order::where('idempotency_key', 'idem-fault-prot-checkout')->count())->toBe(1);
    $this->assertDatabaseHas('replay_attempts', [
        'run_id' => 'run-fault-prot-checkout',
        'http_status' => 503,
    ]);
});

test('reservation fault returns structured json without exception payload', function () use ($faultPayload) {
    $response = $this->postJson('/api/reservations', [
        'operation_id' => 'op-fault-reservation',
        'inject_fault' => true,
        'run_id' => 'run-fault-reservation',
        'attempt_id' => 'attempt-fault-reservation',
    ]);

    $response->assertStatus(503)
        ->assertExactJson($faultPayload)
        ->assertJsonMissingPath('exception')
        ->assertJsonMissingPath('trace');

    $this->assertDatabaseCount('reservations', 1);
    $this->assertDatabaseHas('replay_attempts', [
        'run_id' => 'run-fault-reservation',
        'http_status' => 503,
        'resource_type' => 'reservation',
    ]);
});

test('protected reservation fault returns structured json without exception payload', function () use ($faultPayload) {
    $response = $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-fault-prot-reservation',
        'idempotency_key' => 'idem-fault-prot-reservation',
        'inject_fault' => true,
        'run_id' => 'run-fault-prot-reservation',
        'attempt_id' => 'attempt-fault-prot-reservation',
    ]);

    $response->assertStatus(503)
        ->assertExactJson($faultPayload)
        ->assertJsonMissingPath('exception')
        ->assertJsonMissingPath('trace');

    expect(Reservation::where('idempotency_key', 'idem-fault-prot-reservation')->count())->toBe(1);
    $this->assertDatabaseHas('replay_attempts', [
        'run_id' => 'run-fault-prot-reservation',
        'http_status' => 503,
    ]);
});

test('fault injection remains restricted outside local and testing', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $this->postJson('/api/checkout', [
        'operation_id' => 'op-prod-block',
        'inject_fault' => true,
    ])->assertForbidden();

    $this->assertDatabaseCount('orders', 0);
});
