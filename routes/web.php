<?php

use App\Http\Controllers\DemoController;
use App\Http\Controllers\ReplayHistoryController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// Demo page — local/testing only (controller enforces the restriction).
Route::get('/demo', [DemoController::class, 'show'])->name('demo');

// Run History — local/testing only (controller enforces the restriction).
Route::get('/demo/history', [ReplayHistoryController::class, 'index'])->name('demo.history');
