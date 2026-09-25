<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\ReplayAttempt;
use Illuminate\Http\JsonResponse;

class ReplayRunController extends Controller
{
    public function show(string $runId): JsonResponse
    {
        $attempts = ReplayAttempt::where('run_id', $runId)
            ->orderBy('attempted_at')
            ->get();

        $orderIds = $attempts->pluck('order_id')->unique()->values();
        $orders = Order::whereIn('id', $orderIds)->get();

        return response()->json([
            'run_id' => $runId,
            'attempts' => $attempts,
            'orders' => $orders,
        ]);
    }
}
