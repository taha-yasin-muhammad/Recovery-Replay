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
 * Evidence-completeness rules (fail-closed):
 *   - Exactly two ReplayAttempt rows must be persisted for the run.
 *   - One row must match the first attempt ID; the other must match the second.
 *   - HTTP statuses are read from persisted rows, not from live responses.
 *   - Both rows must carry a non-empty resource_type and a positive resource_id.
 *   - resource_type must be identical across the two expected attempts.
 *   - Any deviation produces operation_safe=false and verdict=INCONCLUSIVE.
 *
 * @phpstan-type RunReport array{
 *     run_id: string,
 *     scenario: string,
 *     attempts: list<array<string, mixed>>,
 *     resource_ids: list<int>,
 *     duplicate_resources: bool,
 *     same_resource_on_retry: bool,
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
        $this->scenario->attempt($runId, $operationId, $attemptId1, injectFault: true);

        // Attempt 2: client retries the same logical operation.
        $this->scenario->attempt($runId, $operationId, $attemptId2, injectFault: false);

        return $this->buildReport($runId, $attemptId1, $attemptId2);
    }

    /**
     * @return RunReport
     */
    private function buildReport(string $runId, string $attemptId1, string $attemptId2): array
    {
        $attempts = ReplayAttempt::where('run_id', $runId)
            ->orderBy('attempted_at')
            ->get();

        // ----------------------------------------------------------------
        // Evidence-completeness gate — fail closed on any deviation.
        // ----------------------------------------------------------------

        // Gate 1: No evidence at all.
        if ($attempts->isEmpty()) {
            return $this->inconclusiveReport($runId, [], 'no evidence recorded for this run');
        }

        // Gate 2: Wrong number of persisted rows (need exactly 2).
        if ($attempts->count() !== 2) {
            return $this->inconclusiveReport(
                $runId,
                $attempts->all(),
                sprintf(
                    'expected 2 persisted attempt rows, found %d',
                    $attempts->count(),
                ),
            );
        }

        // Gate 3: The two rows must carry the expected attempt IDs — one each,
        // no duplicates, no cross-contamination from another run.
        $persistedIds = $attempts->pluck('attempt_id')->all();

        $hasFirst = in_array($attemptId1, $persistedIds, strict: true);
        $hasSecond = in_array($attemptId2, $persistedIds, strict: true);

        if (! $hasFirst || ! $hasSecond) {
            return $this->inconclusiveReport(
                $runId,
                $attempts->all(),
                sprintf(
                    'persisted attempt IDs [%s] do not match expected IDs [%s, %s]',
                    implode(', ', $persistedIds),
                    $attemptId1,
                    $attemptId2,
                ),
            );
        }

        // Gate 4: Duplicate attempt IDs within the run (two rows for the same attempt).
        if (count(array_unique($persistedIds)) !== 2) {
            return $this->inconclusiveReport(
                $runId,
                $attempts->all(),
                sprintf(
                    'duplicate attempt IDs detected in persisted rows: [%s]',
                    implode(', ', $persistedIds),
                ),
            );
        }

        // Identify the two attempt rows by their persisted attempt_id.
        /** @var ReplayAttempt $firstAttempt */
        $firstAttempt = $attempts->firstWhere('attempt_id', $attemptId1);

        /** @var ReplayAttempt $secondAttempt */
        $secondAttempt = $attempts->firstWhere('attempt_id', $attemptId2);

        // Gate 5: Resource identity must be present, valid, and type-consistent.
        // A missing/invalid identity on either row must not collapse into a
        // false "same resource" PASS (e.g. one null filtered away leaving one id).
        $identityFailure = PersistedEvidenceEvaluator::resourceIdentityFailure(
            $firstAttempt,
            $secondAttempt,
        );

        if ($identityFailure !== null) {
            return $this->inconclusiveReport($runId, $attempts->all(), $identityFailure);
        }

        // ----------------------------------------------------------------
        // Evidence is complete. Derive all outcomes from persisted rows only.
        // Shared with historical evaluation so CLI / history cannot disagree.
        // ----------------------------------------------------------------

        $outcome = PersistedEvidenceEvaluator::evaluateCompletePair($firstAttempt, $secondAttempt);

        // Legacy checkout fields — populated only when all attempts are orders.
        $allOrders = $attempts->every(fn ($a) => ($a->resource_type ?? 'order') === 'order');

        $orderIds = $allOrders
            ? array_values(
                $attempts
                    ->map(function (ReplayAttempt $attempt): int {
                        $identifier = $attempt->order_id;

                        return is_numeric($identifier) ? (int) $identifier : 0;
                    })
                    ->filter(fn (int $id): bool => $id > 0)
                    ->unique()
                    ->sort()
                    ->all(),
            )
            : [];

        $duplicateOrders = count($orderIds) > 1;
        $sameOrderOnRetry = count($orderIds) === 1;

        $firstStatus = $firstAttempt->http_status;
        $secondStatus = $secondAttempt->http_status;

        $verdict = match (true) {
            ! $outcome['reproduction_succeeded'] => 'INCONCLUSIVE — unexpected HTTP sequence ('.$firstStatus.' / '.$secondStatus.')',
            $outcome['operation_safe'] => 'PASS — retry returned the same resource (idempotency held)',
            $outcome['duplicate_resources'] => 'EXPECTED FAILURE — duplicate resources created (no idempotency protection)',
            default => 'INCONCLUSIVE — unexpected outcome',
        };

        return [
            'run_id' => $runId,
            'scenario' => $this->scenario->label(),
            'attempts' => array_values($attempts->map(fn (ReplayAttempt $attempt): array => [
                'attempt_id' => $attempt->attempt_id,
                'http_status' => $attempt->http_status,
                'resource_type' => $attempt->resource_type,
                'resource_id' => $attempt->resource_id,
                'order_id' => $attempt->order_id,
                'order_count_after' => $attempt->order_count_after,
                'attempted_at' => $attempt->attempted_at->toIso8601String(),
            ])->all()),
            'resource_ids' => $outcome['resource_ids'],
            'duplicate_resources' => $outcome['duplicate_resources'],
            'same_resource_on_retry' => $outcome['same_resource_on_retry'],
            'order_ids' => $orderIds,
            'duplicate_orders' => $duplicateOrders,
            'same_order_on_retry' => $sameOrderOnRetry,
            'reproduction_succeeded' => $outcome['reproduction_succeeded'],
            'operation_safe' => $outcome['operation_safe'],
            'verdict' => $verdict,
        ];
    }

    /**
     * Build an INCONCLUSIVE report for any evidence-completeness failure.
     *
     * @param  array<int, ReplayAttempt>  $rawAttempts
     * @return RunReport
     */
    private function inconclusiveReport(string $runId, array $rawAttempts, string $reason): array
    {
        $attempts = array_values(
            array_map(fn (ReplayAttempt $attempt): array => [
                'attempt_id' => $attempt->attempt_id,
                'http_status' => $attempt->http_status,
                'resource_type' => $attempt->resource_type,
                'resource_id' => $attempt->resource_id,
                'order_id' => $attempt->order_id,
                'order_count_after' => $attempt->order_count_after,
                'attempted_at' => $attempt->attempted_at->toIso8601String(),
            ], $rawAttempts),
        );

        return [
            'run_id' => $runId,
            'scenario' => $this->scenario->label(),
            'attempts' => $attempts,
            'resource_ids' => [],
            'duplicate_resources' => false,
            'same_resource_on_retry' => false,
            'order_ids' => [],
            'duplicate_orders' => false,
            'same_order_on_retry' => false,
            'reproduction_succeeded' => false,
            'operation_safe' => false,
            'verdict' => 'INCONCLUSIVE — '.$reason,
        ];
    }
}
