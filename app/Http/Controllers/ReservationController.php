<?php

namespace App\Http\Controllers;

use App\Models\ReplayAttempt;
use App\Models\Reservation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReservationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $request->validate([
            'operation_id' => ['required', 'string'],
        ]);

        $reservation = Reservation::create([
            'operation_id' => $request->input('operation_id'),
            'status' => 'pending',
        ]);

        // Deterministic fault injection: simulate a server fault after the
        // reservation has been persisted. The guard above already limits this
        // action to local and testing environments.
        $injectFault = $request->boolean('inject_fault');

        $httpStatus = $injectFault ? 503 : 201;

        // Record replay evidence when a run_id is provided.
        if ($request->filled('run_id')) {
            $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

            ReplayAttempt::create([
                'run_id' => $request->input('run_id'),
                'attempt_id' => $attemptId,
                'operation_id' => $request->input('operation_id'),
                'resource_type' => 'reservation',
                'resource_id' => $reservation->id,
                'http_status' => $httpStatus,
                'order_count_after' => Reservation::where('operation_id', $request->input('operation_id'))->count(),
                'attempted_at' => now(),
            ]);
        }

        if ($injectFault) {
            abort(503, 'Simulated server fault after persistence');
        }

        return response()->json(['reservation_id' => $reservation->id, 'status' => $reservation->status], 201);
    }
}
