<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CheckoutController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'operation_id' => ['required', 'string'],
        ]);

        $order = Order::create([
            'operation_id' => $request->input('operation_id'),
            'status' => 'pending',
        ]);

        // Deterministic fault injection: simulate a server fault after the
        // order has been persisted. Enabled only in local/testing environments.
        if (app()->environment('local', 'testing') && $request->boolean('inject_fault')) {
            abort(503, 'Simulated server fault after persistence');
        }

        return response()->json(['order_id' => $order->id, 'status' => $order->status], 201);
    }
}
