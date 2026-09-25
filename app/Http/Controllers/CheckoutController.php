<?php

namespace App\Http\Controllers;

use App\Http\Responses\SimulatedPersistenceFault;
use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CheckoutController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $request->validate([
            'operation_id' => ['required', 'string'],
        ]);

        $order = Order::create([
            'operation_id' => $request->input('operation_id'),
            'status' => 'pending',
        ]);

        // Deterministic fault injection: simulate a server fault after the
        // order has been persisted. The guard above already limits this
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
                'order_id' => $order->id,
                'resource_type' => 'order',
                'resource_id' => $order->id,
                'http_status' => $httpStatus,
                'order_count_after' => Order::where('operation_id', $request->input('operation_id'))->count(),
                'attempted_at' => now(),
            ]);
        }

        if ($injectFault) {
            return SimulatedPersistenceFault::json();
        }

        return response()->json(['order_id' => $order->id, 'status' => $order->status], 201);
    }
}
