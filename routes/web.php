<?php

use App\Http\Controllers\DemoController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

// Demo page — local/testing only (controller enforces the restriction).
Route::get('/demo', [DemoController::class, 'show'])->name('demo');
