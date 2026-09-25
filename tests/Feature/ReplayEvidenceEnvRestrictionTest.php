<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// Evidence recording is restricted to local/testing environments.
// In production the run_id payload is silently ignored.

test('evidence is not recorded when environment is production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->postJson('/api/checkout', [
        'operation_id' => 'op-prod-001',
        'run_id' => 'run-prod-001',
        'attempt_id' => 'attempt-prod-1',
    ]);

    // Checkout still succeeds.
    $response->assertStatus(201);

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
