<?php

namespace App\Http\Controllers;

use App\Models\ReplayAttempt;
use App\Models\Reservation;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProtectedReservationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $request->validate([
            'operation_id' => ['required', 'string'],
            'idempotency_key' => ['required', 'string'],
        ]);

        $idempotencyKey = $request->input('idempotency_key');
        $operationId = $request->input('operation_id');

        // If a reservation with this idempotency key already exists, return it
        // idempotently — no new reservation is created.
        $existing = Reservation::where('idempotency_key', $idempotencyKey)->first();

        if ($existing !== null) {
            // The idempotency key is bound to the original operation_id.
            // Reusing the same key for a different operation is a conflict.
            if ($existing->operation_id !== $operationId) {
                return response()->json([
                    'message' => 'This idempotency key was used for a different operation.',
                ], 409);
            }

            $httpStatus = 200;

            if (app()->environment('local', 'testing') && $request->filled('run_id')) {
                $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

                ReplayAttempt::create([
                    'run_id' => $request->input('run_id'),
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'resource_type' => 'reservation',
                    'resource_id' => $existing->id,
                    'http_status' => $httpStatus,
                    'order_count_after' => Reservation::where('operation_id', $operationId)->count(),
                    'attempted_at' => now(),
                ]);
            }

            return response()->json(['reservation_id' => $existing->id, 'status' => $existing->status], 200);
        }

        // No existing reservation — create one now.
        try {
            $reservation = Reservation::create([
                'operation_id' => $operationId,
                'idempotency_key' => $idempotencyKey,
                'status' => 'pending',
            ]);
        } catch (UniqueConstraintViolationException) {
            // A concurrent request already created the reservation between our
            // lookup and our insert. Fetch and return it idempotently, but only
            // if the operation_id matches — a conflicting concurrent request is a 409.
            $reservation = Reservation::where('idempotency_key', $idempotencyKey)->firstOrFail();

            if ($reservation->operation_id !== $operationId) {
                return response()->json([
                    'message' => 'This idempotency key was used for a different operation.',
                ], 409);
            }

            return response()->json(['reservation_id' => $reservation->id, 'status' => $reservation->status], 200);
        }

        // Deterministic fault injection: simulate a server fault after the
        // reservation has been persisted. Enabled only in local/testing environments.
        $injectFault = app()->environment('local', 'testing') && $request->boolean('inject_fault');

        $httpStatus = $injectFault ? 503 : 201;

        if (app()->environment('local', 'testing') && $request->filled('run_id')) {
            $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

            ReplayAttempt::create([
                'run_id' => $request->input('run_id'),
                'attempt_id' => $attemptId,
                'operation_id' => $operationId,
                'resource_type' => 'reservation',
                'resource_id' => $reservation->id,
                'http_status' => $httpStatus,
                'order_count_after' => Reservation::where('operation_id', $operationId)->count(),
                'attempted_at' => now(),
            ]);
        }

        if ($injectFault) {
            abort(503, 'Simulated server fault after persistence');
        }

        return response()->json(['reservation_id' => $reservation->id, 'status' => $reservation->status], 201);
    }
}
