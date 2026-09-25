<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// All checkout and replay endpoints are restricted to local/testing environments.
// In production these routes are not registered at all.

test('checkout endpoint is forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->postJson('/api/checkout', [
        'operation_id' => 'op-prod-001',
        'run_id' => 'run-prod-001',
        'attempt_id' => 'attempt-prod-1',
    ]);

    // Demo endpoint is forbidden in production.
    $response->assertStatus(403);

    // No replay evidence was recorded.
    $this->assertDatabaseCount('replay_attempts', 0);
});

test('evidence is recorded in the testing environment', function () {
    $response = $this->postJson('/api/checkout', [
        'operation_id' => 'op-test-001',
        'run_id' => 'run-test-001',
        'attempt_id' => 'attempt-test-1',
    ]);

    $response->assertStatus(201);

    $this->assertDatabaseCount('replay_attempts', 1);
    $this->assertDatabaseHas('replay_attempts', [
        'run_id' => 'run-test-001',
        'attempt_id' => 'attempt-test-1',
    ]);
});
