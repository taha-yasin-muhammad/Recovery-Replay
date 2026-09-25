<?php

use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// replay:run checkout --mode=vulnerable
// Expects: two orders created, first attempt 503, second 201.

test('replay:run checkout vulnerable exits 0 and creates two orders', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable'])
        ->assertExitCode(0);

    $this->assertDatabaseCount('orders', 2);
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('replay:run checkout vulnerable records 503 then 201', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);

    $attempts = ReplayAttempt::orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(201);
});

test('replay:run checkout vulnerable produces two distinct order IDs', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);

    $attempts = ReplayAttempt::all();

    $uniqueOrderIds = $attempts->pluck('order_id')->unique();
    expect($uniqueOrderIds)->toHaveCount(2);
});

test('replay:run checkout vulnerable JSON report exits 0 and creates two orders', function () {
    $this->artisan('replay:run checkout --mode=vulnerable --json')
        ->assertExitCode(0);

    $this->assertDatabaseCount('orders', 2);
    $this->assertDatabaseCount('replay_attempts', 2);
});

// replay:run checkout --mode=protected
// Expects: one order created, first attempt 503, second 200, same order_id.

test('replay:run checkout protected exits 0 and creates exactly one order', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'protected'])
        ->assertExitCode(0);

    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseCount('replay_attempts', 2);
});

test('replay:run checkout protected records 503 then 200', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'protected']);

    $attempts = ReplayAttempt::orderBy('attempted_at')->get();

    expect($attempts)->toHaveCount(2);
    expect($attempts[0]->http_status)->toBe(503);
    expect($attempts[1]->http_status)->toBe(200);
});

test('replay:run checkout protected both attempts reference the same order', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'protected']);

    $attempts = ReplayAttempt::all();

    expect($attempts->pluck('order_id')->unique())->toHaveCount(1);
    expect($attempts[0]->order_id)->toBe($attempts[1]->order_id);
});

test('replay:run checkout protected JSON report exits 0 and creates one order', function () {
    $this->artisan('replay:run checkout --mode=protected --json')
        ->assertExitCode(0);

    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseCount('replay_attempts', 2);
});

// Edge cases

test('replay:run rejects unknown scenario with exit code 1', function () {
    $this->artisan('replay:run', ['scenario' => 'nonexistent', '--mode' => 'vulnerable'])
        ->assertExitCode(1);
});

test('replay:run rejects unknown mode with exit code 1', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'unknown'])
        ->assertExitCode(1);
});

test('replay:run assigns a fresh run_id per execution so evidence is isolated', function () {
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);
    $this->artisan('replay:run', ['scenario' => 'checkout', '--mode' => 'vulnerable']);

    // Both runs together leave 4 attempts in the database.
    $this->assertDatabaseCount('replay_attempts', 4);

    // Those 4 attempts carry exactly 2 distinct run_ids.
    $distinctRunIds = ReplayAttempt::pluck('run_id')->unique()->values();
    expect($distinctRunIds)->toHaveCount(2);
    expect($distinctRunIds[0])->not->toBe($distinctRunIds[1]);
});
