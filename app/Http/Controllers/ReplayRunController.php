<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\ReplayAttempt;
use App\Models\Reservation;
use App\Replay\RunEvidenceSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class ReplayRunController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $perPage = min(50, max(1, (int) $request->integer('per_page', 20)));

        $runQuery = ReplayAttempt::query()
            ->select('run_id')
            ->selectRaw('MIN(attempted_at) as recorded_at')
            ->groupBy('run_id')
            ->orderByDesc('recorded_at');

        // Exact run_id match only — no partial / fuzzy search.
        if ($request->filled('run_id')) {
            $runQuery->where('run_id', $request->string('run_id')->toString());
        }

        $page = $runQuery->paginate($perPage);
        /** @var Collection<int, object{run_id: string, recorded_at: mixed}> $pageItems */
        $pageItems = collect($page->items());
        $runIds = $pageItems->pluck('run_id')->filter()->values();

        $attemptsByRun = $runIds->isEmpty()
            ? collect()
            : ReplayAttempt::query()
                ->whereIn('run_id', $runIds)
                ->orderBy('attempted_at')
                ->orderBy('id')
                ->get()
                ->groupBy('run_id');

        $runs = $runIds->map(function (string $runId) use ($attemptsByRun): array {
            /** @var Collection<int, ReplayAttempt> $attempts */
            $attempts = $attemptsByRun->get($runId, collect());

            return RunEvidenceSummary::fromAttempts($runId, $attempts);
        })->all();

        return response()->json([
            'data' => $runs,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function show(string $runId): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $attempts = ReplayAttempt::where('run_id', $runId)
            ->orderBy('attempted_at')
            ->orderBy('id')
            ->get();

        if ($attempts->isEmpty()) {
            return response()->json([
                'message' => 'No replay evidence found for this run_id.',
                'run_id' => $runId,
            ], 404);
        }

        // Gather order evidence (checkout scenarios).
        $orderIds = $attempts->where('resource_type', 'order')->pluck('order_id')->filter()->unique()->values();
        $orders = Order::whereIn('id', $orderIds)->get();

        // Gather reservation evidence (reservation scenarios).
        $reservationIds = $attempts->where('resource_type', 'reservation')->pluck('resource_id')->filter()->unique()->values();
        $reservations = Reservation::whereIn('id', $reservationIds)->get();

        $summary = RunEvidenceSummary::fromAttempts($runId, $attempts);

        return response()->json([
            'run_id' => $runId,
            'attempts' => $attempts,
            'orders' => $orders,
            'reservations' => $reservations,
            'summary' => $summary,
        ]);
    }
}
