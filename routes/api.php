<?php

use App\Http\Controllers\CheckoutController;
use App\Http\Controllers\ReplayRunController;
use Illuminate\Support\Facades\Route;

Route::post('/checkout', [CheckoutController::class, 'store']);

// Replay evidence endpoints — restricted to local/testing environments only.
if (app()->environment('local', 'testing')) {
    Route::get('/replay-runs/{runId}', [ReplayRunController::class, 'show']);
}
