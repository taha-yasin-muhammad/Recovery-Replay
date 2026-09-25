<?php

use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\ProtectedCheckoutController;
use App\Http\Controllers\ReplayRunController;
use Illuminate\Support\Facades\Route;

// All checkout and replay endpoints are demo-only — local/testing environments only.
if (app()->environment('local', 'testing')) {
    Route::post('/checkout', [CheckoutController::class, 'store']);
    Route::post('/checkout/protected', [ProtectedCheckoutController::class, 'store']);
    Route::get('/replay-runs/{runId}', [ReplayRunController::class, 'show']);
}
