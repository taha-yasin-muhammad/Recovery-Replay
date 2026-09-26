<?php

namespace App\Replay;

use App\Models\ReplayAttempt;
use Illuminate\Support\Collection;

/**
 * Pure evaluation of persisted ReplayAttempt evidence.
 *
 * Shared by live ReplayRunner outcome derivation and historical RunEvidenceSummary
 * so CLI, Investigation Workspace, and Run History cannot disagree on the same rows.
 *
 * Live ReplayRunner additionally verifies expected attempt IDs (known only during
 * execution). Historical evaluation never invents expected IDs, scenario modes,
 * or HTTP response bodies.
 *
 * @phpstan-type SafetyResult 'safe'|'unsafe'|'inconclusive'
 * @phpstan-type CompletePairOutcome array{
 *     resource_ids: list<int>,
 *     duplicate_resources: bool,
 *     same_resource_on_retry: bool,
 *     reproduction_succeeded: bool,
 *     operation_safe: bool,
 *     safety_result: SafetyResult,
 * }
 * @phpstan-type HistoricalEvaluation array{
 *     resource_type: string|null,
 *     attempt_count: int,
 *     resource_count: int,
 *     resource_ids: list<int>,
 *     reproduction_succeeded: bool,
 *     operation_safe: bool,
 *     duplicate_resources: bool,
 *     same_resource_on_retry: bool,
 *     safety_result: SafetyResult,
 *     incomplete: bool,
 * }
 */
final class PersistedEvidenceEvaluator
{
    /**
     * Evaluate a historical run from persisted rows only.
     *
     * @param  Collection<int, ReplayAttempt>  $attempts
     * @return HistoricalEvaluation
     */
    public static function evaluateHistorical(Collection $attempts): array
    {
        $ordered = $attempts
            ->sortBy([
                ['attempted_at', 'asc'],
                ['id', 'asc'],
            ])
            ->values();

        $attemptCount = $ordered->count();
        $resourceType = self::unanimousResourceType($ordered);

        // Gate: exactly two rows establish the expected attempt sequence.
        if ($attemptCount !== 2) {
            return self::inconclusiveHistorical(
                resourceType: $resourceType,
                attemptCount: $attemptCount,
                incomplete: true,
            );
        }

        // Gate: duplicate attempt IDs cannot establish a first/retry pair.
        $persistedIds = $ordered->pluck('attempt_id')->all();

        if (count(array_unique($persistedIds)) !== 2) {
            return self::inconclusiveHistorical(
                resourceType: $resourceType,
                attemptCount: $attemptCount,
                incomplete: true,
            );
        }

        /** @var ReplayAttempt $first */
        $first = $ordered->get(0);
        /** @var ReplayAttempt $second */
        $second = $ordered->get(1);

        // Gate: resource identity must be present, valid, and type-consistent.
        if (self::resourceIdentityFailure($first, $second) !== null) {
            return self::inconclusiveHistorical(
                resourceType: $resourceType,
                attemptCount: $attemptCount,
                incomplete: true,
            );
        }

        $outcome = self::evaluateCompletePair($first, $second);

        return [
            'resource_type' => $first->resource_type,
            'attempt_count' => $attemptCount,
            'resource_count' => count($outcome['resource_ids']),
            'resource_ids' => $outcome['resource_ids'],
            'reproduction_succeeded' => $outcome['reproduction_succeeded'],
            'operation_safe' => $outcome['operation_safe'],
            'duplicate_resources' => $outcome['duplicate_resources'],
            'same_resource_on_retry' => $outcome['same_resource_on_retry'],
            'safety_result' => $outcome['safety_result'],
            'incomplete' => false,
        ];
    }

    /**
     * Return a failure reason when resource identity evidence is incomplete or
     * contradictory; null when both attempts carry usable identity.
     */
    public static function resourceIdentityFailure(ReplayAttempt $first, ReplayAttempt $second): ?string
    {
        foreach ([['first', $first], ['second', $second]] as [$label, $attempt]) {
            /** @var ReplayAttempt $attempt */
            if (! is_string($attempt->resource_type) || $attempt->resource_type === '') {
                return sprintf('missing or empty resource_type on %s attempt', $label);
            }

            if (! is_numeric($attempt->resource_id) || (int) $attempt->resource_id <= 0) {
                return sprintf('missing or invalid resource_id on %s attempt', $label);
            }
        }

        if ($first->resource_type !== $second->resource_type) {
            return sprintf(
                'inconsistent resource_type across attempts: [%s, %s]',
                $first->resource_type,
                $second->resource_type,
            );
        }

        return null;
    }

    /**
     * Derive safety outcomes from a complete, identity-valid attempt pair.
     *
     * Uses persisted HTTP statuses and resource_id values only — never resource
     * counts alone, order_id fallbacks, or live response bodies.
     *
     * @return CompletePairOutcome
     */
    public static function evaluateCompletePair(ReplayAttempt $first, ReplayAttempt $second): array
    {
        $resourceIds = array_values(array_unique([
            (int) $first->resource_id,
            (int) $second->resource_id,
        ]));
        sort($resourceIds);

        $duplicateResources = count($resourceIds) > 1;
        $sameResourceOnRetry = count($resourceIds) === 1;

        $reproductionSucceeded = $first->http_status === 503
            && in_array($second->http_status, [200, 201], strict: true);

        $operationSafe = $reproductionSucceeded && $sameResourceOnRetry;

        $safetyResult = match (true) {
            ! $reproductionSucceeded => 'inconclusive',
            $operationSafe => 'safe',
            $duplicateResources => 'unsafe',
            default => 'inconclusive',
        };

        return [
            'resource_ids' => $resourceIds,
            'duplicate_resources' => $duplicateResources,
            'same_resource_on_retry' => $sameResourceOnRetry,
            'reproduction_succeeded' => $reproductionSucceeded,
            'operation_safe' => $operationSafe,
            'safety_result' => $safetyResult,
        ];
    }

    /**
     * @param  Collection<int, ReplayAttempt>  $attempts
     */
    private static function unanimousResourceType(Collection $attempts): ?string
    {
        $resourceTypes = $attempts
            ->pluck('resource_type')
            ->filter(fn (mixed $type): bool => is_string($type) && $type !== '')
            ->unique()
            ->values();

        return $resourceTypes->count() === 1
            ? $resourceTypes->first()
            : null;
    }

    /**
     * @return HistoricalEvaluation
     */
    private static function inconclusiveHistorical(
        ?string $resourceType,
        int $attemptCount,
        bool $incomplete,
    ): array {
        return [
            'resource_type' => $resourceType,
            'attempt_count' => $attemptCount,
            'resource_count' => 0,
            'resource_ids' => [],
            'reproduction_succeeded' => false,
            'operation_safe' => false,
            'duplicate_resources' => false,
            'same_resource_on_retry' => false,
            'safety_result' => 'inconclusive',
            'incomplete' => $incomplete,
        ];
    }
}
