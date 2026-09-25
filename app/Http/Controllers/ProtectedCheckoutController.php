<?php

namespace App\Http\Controllers;

use App\Http\Responses\SimulatedPersistenceFault;
use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProtectedCheckoutController extends Controller
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

        // If an order with this idempotency key already exists, return it
        // idempotently — no new order is created.
        $existing = Order::where('idempotency_key', $idempotencyKey)->first();

        if ($existing !== null) {
            // The idempotency key is bound to the original operation_id.
            // Reusing the same key for a different operation is a conflict.
            if ($existing->operation_id !== $operationId) {
                return response()->json([
                    'message' => 'This idempotency key was used for a different operation.',
                ], 409);
            }

            $httpStatus = 200;

            if ($request->filled('run_id')) {
                $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

                ReplayAttempt::create([
                    'run_id' => $request->input('run_id'),
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'order_id' => $existing->id,
                    'resource_type' => 'order',
                    'resource_id' => $existing->id,
                    'http_status' => $httpStatus,
                    'order_count_after' => Order::where('operation_id', $operationId)->count(),
                    'attempted_at' => now(),
                ]);
            }

            return response()->json(['order_id' => $existing->id, 'status' => $existing->status], 200);
        }

        // No existing order — create one now.
        try {
            $order = Order::create([
                'operation_id' => $operationId,
                'idempotency_key' => $idempotencyKey,
                'status' => 'pending',
            ]);
        } catch (UniqueConstraintViolationException) {
            // A concurrent request already created the order between our lookup
            // and our insert. Fetch and return it idempotently, but only if the
            // operation_id matches — a conflicting concurrent request is a 409.
            $order = Order::where('idempotency_key', $idempotencyKey)->firstOrFail();

            if ($order->operation_id !== $operationId) {
                return response()->json([
                    'message' => 'This idempotency key was used for a different operation.',
                ], 409);
            }

            return response()->json(['order_id' => $order->id, 'status' => $order->status], 200);
        }

        // Deterministic fault injection: simulate a server fault after the
        // order has been persisted. The guard above already limits this
        // action to local and testing environments.
        $injectFault = $request->boolean('inject_fault');

        $httpStatus = $injectFault ? 503 : 201;

        if ($request->filled('run_id')) {
            $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

            ReplayAttempt::create([
                'run_id' => $request->input('run_id'),
                'attempt_id' => $attemptId,
                'operation_id' => $operationId,
                'order_id' => $order->id,
                'resource_type' => 'order',
                'resource_id' => $order->id,
                'http_status' => $httpStatus,
                'order_count_after' => Order::where('operation_id', $operationId)->count(),
                'attempted_at' => now(),
            ]);
        }

        if ($injectFault) {
            return SimulatedPersistenceFault::json();
        }

        return response()->json(['order_id' => $order->id, 'status' => $order->status], 201);
    }
}
