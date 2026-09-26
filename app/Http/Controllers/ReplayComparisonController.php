<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\ReplayAttempt;
use App\Models\ReplayComparison;
use App\Models\Reservation;
use App\Replay\ComparisonService;
use App\Replay\RunEvidenceSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReplayComparisonController extends Controller
{
    /**
     * List saved comparisons, newest first.
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $perPage = min(50, max(1, (int) $request->integer('per_page', 20)));

        $page = ReplayComparison::query()
            ->orderByDesc('created_at')
            ->orderByDesc('comparison_id')
            ->paginate($perPage);

        $items = collect($page->items())
            ->map(fn (ReplayComparison $comparison): array => [
                'comparison_id' => $comparison->comparison_id,
                'resource_type' => $comparison->resource_type,
                'before_run_id' => $comparison->before_run_id,
                'after_run_id' => $comparison->after_run_id,
                'created_at' => $comparison->created_at->toIso8601String(),
            ])
            ->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /**
     * Retrieve a comparison by comparison_id, with full evidence for both runs.
     */
    public function show(string $comparisonId): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $comparison = ReplayComparison::find($comparisonId);

        if ($comparison === null) {
            return response()->json([
                'message' => 'No saved comparison found for this comparison_id.',
                'comparison_id' => $comparisonId,
            ], 404);
        }

        $beforeData = $this->loadRunData($comparison->before_run_id);
        $afterData = $this->loadRunData($comparison->after_run_id);

        return response()->json([
            'comparison_id' => $comparison->comparison_id,
            'resource_type' => $comparison->resource_type,
            'before_run_id' => $comparison->before_run_id,
            'after_run_id' => $comparison->after_run_id,
            'created_at' => $comparison->created_at->toIso8601String(),
            'before' => $beforeData,
            'after' => $afterData,
        ]);
    }

    /**
     * Save a new comparison association after validating evidence.
     */
    public function store(Request $request): JsonResponse
    {
        abort_unless(app()->environment('local', 'testing'), 403);

        $beforeRunId = (string) $request->input('before_run_id', '');
        $afterRunId = (string) $request->input('after_run_id', '');

        $result = ComparisonService::save($beforeRunId, $afterRunId);

        if (! $result['saved']) {
            return response()->json([
                'saved' => false,
                'comparison_id' => null,
                'error' => $result['error'],
            ], 422);
        }

        return response()->json([
            'saved' => true,
            'comparison_id' => $result['comparison_id'],
            'error' => null,
        ], 201);
    }

    /**
     * Load run attempts and associated persisted resources and summary.
     *
     * @return array{run_id: string, attempts: mixed, orders: mixed, reservations: mixed, summary: mixed}
     */
    private function loadRunData(string $runId): array
    {
        $attempts = ReplayAttempt::where('run_id', $runId)
            ->orderBy('attempted_at')
            ->orderBy('id')
            ->get();

        $orderIds = $attempts->where('resource_type', 'order')->pluck('order_id')->filter()->unique()->values();
        $orders = Order::whereIn('id', $orderIds)->get();

        $reservationIds = $attempts->where('resource_type', 'reservation')->pluck('resource_id')->filter()->unique()->values();
        $reservations = Reservation::whereIn('id', $reservationIds)->get();

        $summary = RunEvidenceSummary::fromAttempts($runId, $attempts);

        return [
            'run_id' => $runId,
            'attempts' => $attempts,
            'orders' => $orders,
            'reservations' => $reservations,
            'summary' => $summary,
        ];
    }
}
