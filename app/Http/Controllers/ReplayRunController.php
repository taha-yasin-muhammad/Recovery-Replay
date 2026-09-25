<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\ReplayAttempt;
use App\Models\Reservation;
use Illuminate\Http\JsonResponse;

class ReplayRunController extends Controller
{
    public function show(string $runId): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $attempts = ReplayAttempt::where('run_id', $runId)
            ->orderBy('attempted_at')
            ->get();

        // Gather order evidence (checkout scenarios).
        $orderIds = $attempts->where('resource_type', 'order')->pluck('order_id')->filter()->unique()->values();
        $orders = Order::whereIn('id', $orderIds)->get();

        // Gather reservation evidence (reservation scenarios).
        $reservationIds = $attempts->where('resource_type', 'reservation')->pluck('resource_id')->filter()->unique()->values();
        $reservations = Reservation::whereIn('id', $reservationIds)->get();

        return response()->json([
            'run_id' => $runId,
            'attempts' => $attempts,
            'orders' => $orders,
            'reservations' => $reservations,
        ]);
    }
}
