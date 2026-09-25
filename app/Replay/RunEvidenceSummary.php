<?php

namespace App\Replay;

use App\Models\ReplayAttempt;
use Illuminate\Support\Collection;

/**
 * Builds list/detail metadata for a run from persisted ReplayAttempt rows only.
 *
 * Does not invent HTTP bodies, scenario modes, or comparison pairings.
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

        $resourceTypes = $ordered
            ->pluck('resource_type')
            ->filter(fn (mixed $type): bool => is_string($type) && $type !== '')
            ->unique()
            ->values();

        // Only report a type when every attempt agrees. Mixed or missing → unavailable.
        $resourceType = $resourceTypes->count() === 1
            ? $resourceTypes->first()
            : null;

        $resourceIds = array_values(
            $ordered
                ->map(function (ReplayAttempt $attempt): int {
                    $identifier = $attempt->resource_id ?? $attempt->order_id;

                    return is_numeric($identifier) ? (int) $identifier : 0;
                })
                ->filter(fn (int $id): bool => $id > 0)
                ->unique()
                ->sort()
                ->all(),
        );

        $incomplete = $ordered->count() < 2;
        $first = $ordered->get(0);
        $second = $ordered->get(1);

        $reproductionSucceeded = $first instanceof ReplayAttempt
            && $second instanceof ReplayAttempt
            && $first->http_status === 503
            && in_array($second->http_status, [200, 201], true);

        $duplicateResources = count($resourceIds) > 1;
        $sameResourceOnRetry = count($resourceIds) === 1;
        $operationSafe = $reproductionSucceeded && $sameResourceOnRetry;

        $safetyResult = match (true) {
            $incomplete, ! $reproductionSucceeded => 'inconclusive',
            $operationSafe => 'safe',
            default => 'unsafe',
        };

        $recordedAt = $first instanceof ReplayAttempt
            ? $first->attempted_at->toIso8601String()
            : null;

        return [
            'run_id' => $runId,
            'resource_type' => $resourceType,
            'attempt_count' => $ordered->count(),
            'resource_count' => count($resourceIds),
            'recorded_at' => $recordedAt,
            'reproduction_succeeded' => $reproductionSucceeded,
            'operation_safe' => $operationSafe,
            'duplicate_resources' => $duplicateResources,
            'same_resource_on_retry' => $sameResourceOnRetry,
            'safety_result' => $safetyResult,
            'incomplete' => $incomplete,
            'resource_ids' => $resourceIds,
        ];
    }
}
