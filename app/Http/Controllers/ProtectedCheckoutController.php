<?php

namespace App\Http\Controllers;

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
            $httpStatus = 200;

            if (app()->environment('local', 'testing') && $request->filled('run_id')) {
                $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

                ReplayAttempt::create([
                    'run_id' => $request->input('run_id'),
                    'attempt_id' => $attemptId,
                    'operation_id' => $operationId,
                    'order_id' => $existing->id,
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
            // and our insert. Fetch and return it idempotently.
            $order = Order::where('idempotency_key', $idempotencyKey)->firstOrFail();

            return response()->json(['order_id' => $order->id, 'status' => $order->status], 200);
        }

        // Deterministic fault injection: simulate a server fault after the
        // order has been persisted. Enabled only in local/testing environments.
        $injectFault = app()->environment('local', 'testing') && $request->boolean('inject_fault');

        $httpStatus = $injectFault ? 503 : 201;

        if (app()->environment('local', 'testing') && $request->filled('run_id')) {
            $attemptId = $request->input('attempt_id') ?: (string) Str::uuid();

            ReplayAttempt::create([
                'run_id' => $request->input('run_id'),
                'attempt_id' => $attemptId,
                'operation_id' => $operationId,
                'order_id' => $order->id,
                'http_status' => $httpStatus,
                'order_count_after' => Order::where('operation_id', $operationId)->count(),
                'attempted_at' => now(),
            ]);
        }

        if ($injectFault) {
            abort(503, 'Simulated server fault after persistence');
        }

        return response()->json(['order_id' => $order->id, 'status' => $order->status], 201);
    }
}
