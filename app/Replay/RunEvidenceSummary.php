<?php

namespace App\Replay;

use App\Models\ReplayAttempt;
use Illuminate\Support\Collection;

/**
 * Builds list/detail metadata for a run from persisted ReplayAttempt rows only.
 *
 * Does not invent HTTP bodies, scenario modes, expected attempt IDs, or
 * comparison pairings. Safety flags come from PersistedEvidenceEvaluator so
 * historical views stay aligned with ReplayRunner integrity rules.
 *
 * @phpstan-type RunSummary array{
 *     run_id: string,
 *     resource_type: string|null,
 *     attempt_count: int,
 *     resource_count: int,
 *     recorded_at: string|null,
 *     reproduction_succeeded: bool,
 *     operation_safe: bool,
 *     duplicate_resources: bool,
 *     same_resource_on_retry: bool,
 *     safety_result: 'safe'|'unsafe'|'inconclusive',
 *     incomplete: bool,
 *     resource_ids: list<int>,
 * }
 */
final class RunEvidenceSummary
{
    /**
     * @param  Collection<int, ReplayAttempt>  $attempts
     * @return RunSummary
     */
    public static function fromAttempts(string $runId, Collection $attempts): array
    {
        $ordered = $attempts
            ->sortBy([
                ['attempted_at', 'asc'],
                ['id', 'asc'],
            ])
            ->values();

        $evaluation = PersistedEvidenceEvaluator::evaluateHistorical($ordered);

        $first = $ordered->get(0);
        $recordedAt = $first instanceof ReplayAttempt
            ? $first->attempted_at->toIso8601String()
            : null;

        return [
            'run_id' => $runId,
            'resource_type' => $evaluation['resource_type'],
            'attempt_count' => $evaluation['attempt_count'],
            'resource_count' => $evaluation['resource_count'],
            'recorded_at' => $recordedAt,
            'reproduction_succeeded' => $evaluation['reproduction_succeeded'],
            'operation_safe' => $evaluation['operation_safe'],
            'duplicate_resources' => $evaluation['duplicate_resources'],
            'same_resource_on_retry' => $evaluation['same_resource_on_retry'],
            'safety_result' => $evaluation['safety_result'],
            'incomplete' => $evaluation['incomplete'],
            'resource_ids' => $evaluation['resource_ids'],
        ];
    }
}
