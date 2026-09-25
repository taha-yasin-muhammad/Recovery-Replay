<?php

use App\Models\ReplayAttempt;
use App\Models\Reservation;
use App\Replay\ReplayRunner;
use App\Replay\Scenarios\ProtectedReservationScenario;
use App\Replay\Scenarios\VulnerableReservationScenario;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// ---------------------------------------------------------------------------
// Vulnerable reservation endpoint
// ---------------------------------------------------------------------------

test('reservation with fault injection returns 503 but persists the reservation', function () {
    $response = $this->postJson('/api/reservations', [
        'operation_id' => 'op-res-fault-1',
        'inject_fault' => true,
    ]);

    $response->assertStatus(503);
    $this->assertDatabaseCount('reservations', 1);
    $this->assertDatabaseHas('reservations', ['operation_id' => 'op-res-fault-1']);
});

test('retrying the same reservation without idempotency creates a second reservation', function () {
    $this->postJson('/api/reservations', [
        'operation_id' => 'op-res-dup-1',
        'inject_fault' => true,
    ])->assertStatus(503);

    $this->assertDatabaseCount('reservations', 1);

    $retry = $this->postJson('/api/reservations', [
        'operation_id' => 'op-res-dup-1',
        'inject_fault' => false,
    ]);

    $retry->assertStatus(201);
    $this->assertDatabaseCount('reservations', 2);
});

test('successful reservation without fault returns 201 and reservation data', function () {
    $response = $this->postJson('/api/reservations', [
        'operation_id' => 'op-res-ok-1',
    ]);

    $response->assertStatus(201)
        ->assertJsonStructure(['reservation_id', 'status'])
        ->assertJsonFragment(['status' => 'pending']);

    $this->assertDatabaseCount('reservations', 1);
});

// ---------------------------------------------------------------------------
// Protected reservation endpoint
// ---------------------------------------------------------------------------

test('protected reservation creates exactly one reservation even after a 503', function () {
    $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-res-prot-1',
        'idempotency_key' => 'idem-res-prot-1',
        'inject_fault' => true,
    ])->assertStatus(503);

    $this->assertDatabaseCount('reservations', 1);

    $retry = $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-res-prot-1',
        'idempotency_key' => 'idem-res-prot-1',
        'inject_fault' => false,
    ]);

    $retry->assertStatus(200);
    $this->assertDatabaseCount('reservations', 1);
});

test('protected reservation retry returns the same reservation_id', function () {
    $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-res-same-1',
        'idempotency_key' => 'idem-res-same-1',
        'inject_fault' => true,
    ])->assertStatus(503);

    $reservationId = Reservation::where('idempotency_key', 'idem-res-same-1')->value('id');

    $retry = $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-res-same-1',
        'idempotency_key' => 'idem-res-same-1',
    ]);

    $retry->assertStatus(200)
        ->assertJsonFragment(['reservation_id' => $reservationId]);
});

test('reusing a reservation idempotency key for a different operation returns 409', function () {
    $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-res-orig',
        'idempotency_key' => 'idem-res-conflict',
    ])->assertStatus(201);

    $response = $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-res-other',
        'idempotency_key' => 'idem-res-conflict',
    ]);

    $response->assertStatus(409)
        ->assertJsonFragment(['message' => 'This idempotency key was used for a different operation.']);

    $this->assertDatabaseCount('reservations', 1);
});

// ---------------------------------------------------------------------------
// Evidence recording for reservation attempts
// ---------------------------------------------------------------------------

test('reservation attempts record resource_type=reservation and no order_id', function () {
    $runId = 'run-res-evidence-1';

    $this->postJson('/api/reservations', [
        'operation_id' => 'op-res-ev-1',
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'res-attempt-1',
    ])->assertStatus(503);

    $this->postJson('/api/reservations', [
        'operation_id' => 'op-res-ev-1',
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'res-attempt-2',
    ])->assertStatus(201);

    $attempts = ReplayAttempt::where('run_id', $runId)->orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);

    foreach ($attempts as $attempt) {
        expect($attempt->resource_type)->toBe('reservation');
        expect($attempt->resource_id)->not->toBeNull();
        expect($attempt->order_id)->toBeNull();
    }
});

test('protected reservation evidence records same resource_id for both attempts', function () {
    $runId = 'run-res-prot-ev';
    $operationId = 'op-res-prot-ev';
    $idempotencyKey = 'idem-res-prot-ev';

    $this->postJson('/api/reservations/protected', [
        'operation_id' => $operationId,
        'idempotency_key' => $idempotencyKey,
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'res-prot-attempt-1',
    ])->assertStatus(503);

    $this->postJson('/api/reservations/protected', [
        'operation_id' => $operationId,
        'idempotency_key' => $idempotencyKey,
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'res-prot-attempt-2',
    ])->assertStatus(200);

    $attempts = ReplayAttempt::where('run_id', $runId)->orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->resource_id)->toBe($attempts[1]->resource_id);
    expect($attempts[0]->order_id)->toBeNull();
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(200);
    expect($attempts[0]->order_count_after)->toBe(1);
    expect($attempts[1]->order_count_after)->toBe(1);
});

// ---------------------------------------------------------------------------
// ReplayRunner with reservation scenarios
// ---------------------------------------------------------------------------

test('replay:run reservation vulnerable exits 1 (not safe) and creates two reservations', function () {
    $this->artisan('replay:run', ['scenario' => 'reservation', '--mode' => 'vulnerable'])
        ->assertExitCode(1);

    $this->assertDatabaseCount('reservations', 2);
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('replay:run reservation vulnerable records 503 then 201', function () {
    $this->artisan('replay:run', ['scenario' => 'reservation', '--mode' => 'vulnerable']);

    $attempts = ReplayAttempt::orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(201);
});

test('replay:run reservation vulnerable produces two distinct resource IDs', function () {
    $this->artisan('replay:run', ['scenario' => 'reservation', '--mode' => 'vulnerable']);

    $attempts = ReplayAttempt::all();

    expect($attempts->pluck('resource_id')->unique())->toHaveCount(2);
    expect($attempts->pluck('order_id')->filter())->toBeEmpty();
});

test('replay:run reservation protected exits 0 and creates exactly one reservation', function () {
    $this->artisan('replay:run', ['scenario' => 'reservation', '--mode' => 'protected'])
        ->assertExitCode(0);

    $this->assertDatabaseCount('reservations', 1);
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('replay:run reservation protected records 503 then 200', function () {
    $this->artisan('replay:run', ['scenario' => 'reservation', '--mode' => 'protected']);

    $attempts = ReplayAttempt::orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(200);
});

test('replay:run reservation protected both attempts reference the same resource', function () {
    $this->artisan('replay:run', ['scenario' => 'reservation', '--mode' => 'protected']);

    $attempts = ReplayAttempt::all();

    expect($attempts->pluck('resource_id')->unique())->toHaveCount(1);
    expect($attempts[0]->resource_id)->toBe($attempts[1]->resource_id);
});

test('reservation vulnerable scenario report sets reproduction_succeeded true but operation_safe false', function () {
    $runner = new ReplayRunner(new VulnerableReservationScenario);
    $report = $runner->run();

    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['operation_safe'])->toBeFalse();
    expect($report['duplicate_resources'])->toBeTrue();
    expect($report['verdict'])->toContain('EXPECTED FAILURE');
});

test('reservation protected scenario report sets both reproduction_succeeded and operation_safe true', function () {
    $runner = new ReplayRunner(new ProtectedReservationScenario);
    $report = $runner->run();

    expect($report['reproduction_succeeded'])->toBeTrue();
    expect($report['operation_safe'])->toBeTrue();
    expect($report['same_resource_on_retry'])->toBeTrue();
    expect($report['verdict'])->toContain('PASS');
});

test('reservation JSON report exits 0 for protected mode', function () {
    $exitCode = Artisan::call('replay:run', ['scenario' => 'reservation', '--mode' => 'protected', '--json' => true]);

    expect($exitCode)->toBe(0);

    $decoded = json_decode(Artisan::output(), associative: true);
    expect(json_last_error())->toBe(JSON_ERROR_NONE);
    expect($decoded)->toHaveKey('resource_ids');
    expect($decoded)->toHaveKey('duplicate_resources');
    expect($decoded)->toHaveKey('same_resource_on_retry');
    expect($decoded)->toHaveKey('reproduction_succeeded');
    expect($decoded)->toHaveKey('operation_safe');
    expect($decoded)->toHaveKey('verdict');
});

test('reservation JSON report exits 1 for vulnerable mode', function () {
    $exitCode = Artisan::call('replay:run', ['scenario' => 'reservation', '--mode' => 'vulnerable', '--json' => true]);

    expect($exitCode)->toBe(1);

    $decoded = json_decode(Artisan::output(), associative: true);
    expect($decoded['operation_safe'])->toBeFalse();
    expect($decoded['duplicate_resources'])->toBeTrue();
});

// ---------------------------------------------------------------------------
// Environment restrictions for reservation endpoints
// ---------------------------------------------------------------------------

test('/api/reservations is forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->postJson('/api/reservations', ['operation_id' => 'op-prod-res']);

    $response->assertStatus(403);
});

test('/api/reservations/protected is forbidden in production', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->postJson('/api/reservations/protected', [
        'operation_id' => 'op-prod-res-prot',
        'idempotency_key' => 'idem-prod-res',
    ]);

    $response->assertStatus(403);
});

// ---------------------------------------------------------------------------
// Resource type isolation: checkout and reservation evidence must not mix
// ---------------------------------------------------------------------------

test('checkout evidence has resource_type=order and reservation evidence has resource_type=reservation', function () {
    // Checkout attempt
    $this->postJson('/api/checkout', [
        'operation_id' => 'op-mix-checkout',
        'run_id' => 'run-mix-1',
        'attempt_id' => 'mix-checkout-attempt',
    ])->assertStatus(201);

    // Reservation attempt
    $this->postJson('/api/reservations', [
        'operation_id' => 'op-mix-reservation',
        'run_id' => 'run-mix-2',
        'attempt_id' => 'mix-res-attempt',
    ])->assertStatus(201);

    $checkoutAttempt = ReplayAttempt::where('attempt_id', 'mix-checkout-attempt')->first();
    $reservationAttempt = ReplayAttempt::where('attempt_id', 'mix-res-attempt')->first();

    expect($checkoutAttempt->resource_type)->toBe('order');
    expect($checkoutAttempt->order_id)->not->toBeNull();

    expect($reservationAttempt->resource_type)->toBe('reservation');
    expect($reservationAttempt->order_id)->toBeNull();
});

test('replay run endpoint returns reservations for reservation run', function () {
    $runId = 'run-res-endpoint-1';
    $operationId = 'op-res-ep-1';

    $this->postJson('/api/reservations', [
        'operation_id' => $operationId,
        'inject_fault' => true,
        'run_id' => $runId,
        'attempt_id' => 'res-ep-attempt-a',
    ])->assertStatus(503);

    $this->postJson('/api/reservations', [
        'operation_id' => $operationId,
        'inject_fault' => false,
        'run_id' => $runId,
        'attempt_id' => 'res-ep-attempt-b',
    ])->assertStatus(201);

    $response = $this->getJson("/api/replay-runs/{$runId}");

    $response->assertStatus(200)
        ->assertJsonFragment(['run_id' => $runId])
        ->assertJsonCount(2, 'attempts')
        ->assertJsonCount(2, 'reservations')
        ->assertJsonCount(0, 'orders');
});
