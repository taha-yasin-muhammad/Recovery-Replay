<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class ReplayHistoryController extends Controller
{
    public function index(): Response
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        return Inertia::render('history');
    }
}
