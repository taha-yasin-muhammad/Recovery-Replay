<?php

use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\ProtectedCheckoutController;
use App\Http\Controllers\ReplayRunController;
use Illuminate\Support\Facades\Route;

Route::post('/checkout', [CheckoutController::class, 'store']);

// Protected checkout and replay evidence endpoints — local/testing only.
if (app()->environment('local', 'testing')) {
    Route::post('/checkout/protected', [ProtectedCheckoutController::class, 'store']);
    Route::get('/replay-runs/{runId}', [ReplayRunController::class, 'show']);
}
