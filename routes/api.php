<?php

use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\ProtectedCheckoutController;
use App\Http\Controllers\ProtectedReservationController;
use App\Http\Controllers\ReplayRunController;
use App\Http\Controllers\ReservationController;
use Illuminate\Support\Facades\Route;

// All checkout, reservation and replay endpoints are demo-only — local/testing only.
if (app()->environment('local', 'testing')) {
    Route::post('/checkout', [CheckoutController::class, 'store']);
    Route::post('/checkout/protected', [ProtectedCheckoutController::class, 'store']);
    Route::post('/reservations', [ReservationController::class, 'store']);
    Route::post('/reservations/protected', [ProtectedReservationController::class, 'store']);
    Route::get('/replay-runs/{runId}', [ReplayRunController::class, 'show']);
}
