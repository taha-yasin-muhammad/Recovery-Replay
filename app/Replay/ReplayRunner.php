<?php

namespace App\Replay;

use App\Models\ReplayAttempt;
use Illuminate\Support\Str;

/**
 * Executes a ReplayScenario in two passes:
 *   1. First attempt with fault injection (simulates a 503 mid-flight).
 *   2. Second attempt without fault (the client retry).
 *
 * After both attempts complete, it loads the recorded evidence from the
 * database and evaluates the expected outcome per scenario contract.
 *
 * @phpstan-type RunReport array{
 *     run_id: string,
 *     scenario: string,
 *     attempts: list<array<string, mixed>>,
 *     order_ids: list<int>,
 *     duplicate_orders: bool,
 *     same_order_on_retry: bool,
 *     reproduction_succeeded: bool,
 *     operation_safe: bool,
 *     verdict: string,
 * }
 */
class ReplayRunner
{
    public function __construct(private readonly ReplayScenario $scenario) {}

    /**
     * Run the full two-attempt replay and return the report.
     *
     * @return RunReport
     */
    public function run(): array
    {
        $runId = (string) Str::uuid();
        $operationId = 'op-'.Str::random(8);
        $attemptId1 = 'attempt-1-'.Str::random(6);
        $attemptId2 = 'attempt-2-'.Str::random(6);

        // Attempt 1: inject a fault so the server returns 503 after persisting.
        $first = $this->scenario->attempt($runId, $operationId, $attemptId1, injectFault: true);

        // Attempt 2: client retries the same logical operation.
        $second = $this->scenario->attempt($runId, $operationId, $attemptId2, injectFault: false);

        return $this->buildReport($runId, $first, $second);
    }

    /**
     * @param  array<string, mixed>  $first
     * @param  array<string, mixed>  $second
     * @return RunReport
     */
    private function buildReport(string $runId, array $first, array $second): array
    {
        $attempts = ReplayAttempt::where('run_id', $runId)
            ->orderBy('attempted_at')
            ->get();

        // Missing evidence — cannot evaluate any outcome.
        if ($attempts->isEmpty()) {
            return [
                'run_id' => $runId,
                'scenario' => $this->scenario->label(),
                'attempts' => [],
                'order_ids' => [],
                'duplicate_orders' => false,
                'same_order_on_retry' => false,
                'reproduction_succeeded' => false,
                'operation_safe' => false,
                'verdict' => 'INCONCLUSIVE — no evidence recorded for this run',
            ];
        }

        $orderIds = $attempts->pluck('order_id')->unique()->sort()->values()->all();
        $duplicateOrders = count($orderIds) > 1;
        $sameOrderOnRetry = count($orderIds) === 1;

        $firstStatus = $first['http_status'];
        $secondStatus = $second['http_status'];

        // reproduction_succeeded: the two-attempt sequence played out as the
        // scenario was designed to demonstrate (503 on first, success on second).
        $reproductionSucceeded = $firstStatus === 503
            && in_array($secondStatus, [200, 201], strict: true);

        // operation_safe: the business operation is safe — a retry after a 503
        // did not produce a duplicate. True only when idempotency held.
        $operationSafe = $reproductionSucceeded && $sameOrderOnRetry;

        $verdict = match (true) {
            ! $reproductionSucceeded => 'INCONCLUSIVE — unexpected HTTP sequence ('.$firstStatus.' / '.$secondStatus.')',
            $operationSafe => 'PASS — retry returned the same order (idempotency held)',
            $duplicateOrders => 'EXPECTED FAILURE — duplicate orders created (no idempotency protection)',
            default => 'INCONCLUSIVE — unexpected outcome',
        };

        return [
            'run_id' => $runId,
            'scenario' => $this->scenario->label(),
            'attempts' => $attempts->map(fn ($a) => [
                'attempt_id' => $a->attempt_id,
                'http_status' => $a->http_status,
                'order_id' => $a->order_id,
                'order_count_after' => $a->order_count_after,
                'attempted_at' => $a->attempted_at->toIso8601String(),
            ])->values()->all(),
            'order_ids' => $orderIds,
            'duplicate_orders' => $duplicateOrders,
            'same_order_on_retry' => $sameOrderOnRetry,
            'reproduction_succeeded' => $reproductionSucceeded,
            'operation_safe' => $operationSafe,
            'verdict' => $verdict,
        ];
    }
}
