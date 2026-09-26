<?php

namespace App\Replay;

use App\Models\ReplayAttempt;
use App\Models\ReplayComparison;
use Illuminate\Support\Str;

/**
 * Validates and persists a Before/After comparison association.
 *
 * Rules (fail-closed):
 *   - before_run_id and after_run_id must be distinct strings.
 *   - Both runs must have persisted evidence evaluable by PersistedEvidenceEvaluator.
 *   - Both runs must share the same resource_type (same business domain).
 *   - The Before run must be UNSAFE (duplicate resources — the expected vulnerable scenario).
 *   - The After run must be SAFE (idempotency held).
 *   - On any failure the comparison is not persisted; individual runs are preserved.
 *   - Rerunning either side does not modify an existing saved comparison.
 *
 * @phpstan-type SaveResult array{
 *     saved: bool,
 *     comparison_id: string|null,
 *     error: string|null,
 * }
 */
final class ComparisonService
{
    /**
     * Attempt to save a comparison.
     *
     * @return SaveResult
     */
    public static function save(string $beforeRunId, string $afterRunId): array
    {
        // Gate: run IDs must be distinct non-empty strings.
        if ($beforeRunId === '' || $afterRunId === '') {
            return self::failure('before_run_id and after_run_id must not be empty.');
        }

        if ($beforeRunId === $afterRunId) {
            return self::failure('before_run_id and after_run_id must be distinct.');
        }

        // Load evidence for both runs.
        $beforeAttempts = ReplayAttempt::where('run_id', $beforeRunId)
            ->orderBy('attempted_at')
            ->orderBy('id')
            ->get();

        $afterAttempts = ReplayAttempt::where('run_id', $afterRunId)
            ->orderBy('attempted_at')
            ->orderBy('id')
            ->get();

        if ($beforeAttempts->isEmpty()) {
            return self::failure("No persisted evidence found for before_run_id '{$beforeRunId}'.");
        }

        if ($afterAttempts->isEmpty()) {
            return self::failure("No persisted evidence found for after_run_id '{$afterRunId}'.");
        }

        // Evaluate both sides with the authoritative PersistedEvidenceEvaluator.
        $beforeEval = PersistedEvidenceEvaluator::evaluateHistorical($beforeAttempts);
        $afterEval = PersistedEvidenceEvaluator::evaluateHistorical($afterAttempts);

        // Gate: both sides must have complete, non-inconclusive evidence.
        if ($beforeEval['incomplete']) {
            return self::failure('Before run has incomplete or contradictory evidence.');
        }

        if ($afterEval['incomplete']) {
            return self::failure('After run has incomplete or contradictory evidence.');
        }

        // Gate: resource types must match (same business domain).
        $beforeType = $beforeEval['resource_type'];
        $afterType = $afterEval['resource_type'];

        if ($beforeType === null || $afterType === null) {
            return self::failure('One or both runs have an undetermined resource_type.');
        }

        if ($beforeType !== $afterType) {
            return self::failure(
                "Mismatched resource types: before is '{$beforeType}', after is '{$afterType}'. "
                .'Both runs must belong to the same business domain.',
            );
        }

        // Gate: Before must be UNSAFE (expected vulnerable scenario — duplicates created).
        if ($beforeEval['safety_result'] !== 'unsafe') {
            return self::failure(
                "Before run safety_result is '{$beforeEval['safety_result']}'; expected 'unsafe'. "
                .'The before side must demonstrate the vulnerable duplicate-creation scenario.',
            );
        }

        // Gate: After must be SAFE (idempotency held).
        if ($afterEval['safety_result'] !== 'safe') {
            return self::failure(
                "After run safety_result is '{$afterEval['safety_result']}'; expected 'safe'. "
                .'The after side must demonstrate successful idempotency protection.',
            );
        }

        // All gates passed — persist the explicit association.
        $comparisonId = (string) Str::uuid();

        ReplayComparison::create([
            'comparison_id' => $comparisonId,
            'resource_type' => $beforeType,
            'before_run_id' => $beforeRunId,
            'after_run_id' => $afterRunId,
        ]);

        return [
            'saved' => true,
            'comparison_id' => $comparisonId,
            'error' => null,
        ];
    }

    /**
     * @return SaveResult
     */
    private static function failure(string $message): array
    {
        return [
            'saved' => false,
            'comparison_id' => null,
            'error' => $message,
        ];
    }
}
