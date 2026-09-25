<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class DemoController extends Controller
{
    public function show(): Response
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        return Inertia::render('demo');
    }
}
