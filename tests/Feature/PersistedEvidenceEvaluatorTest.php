<?php

use App\Models\ReplayAttempt;
use App\Replay\PersistedEvidenceEvaluator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * @param  list<array{attempt_id: string, http_status: int, resource_type: ?string, resource_id: ?int, attempted_at?: string}>  $rows
 * @return Collection<int, ReplayAttempt>
 */
function evidenceAttempts(array $rows): Collection
{
    return collect($rows)->values()->map(function (array $row, int $index): ReplayAttempt {
        $attempt = new ReplayAttempt([
            'run_id' => 'eval-run',
            'attempt_id' => $row['attempt_id'],
            'operation_id' => 'op-eval',
            'order_id' => ($row['resource_type'] ?? null) === 'order' ? ($row['resource_id'] ?? null) : null,
            'resource_type' => $row['resource_type'] ?? null,
            'resource_id' => $row['resource_id'] ?? null,
            'http_status' => $row['http_status'],
            'order_count_after' => 1,
            'attempted_at' => Carbon::parse($row['attempted_at'] ?? '2026-09-20 10:00:0'.$index),
        ]);
        $attempt->id = $index + 1;

        return $attempt;
    });
}

test('historical evaluator marks duplicate attempt IDs inconclusive without persisting', function () {
    $attempts = evidenceAttempts([
        [
            'attempt_id' => 'same-id',
            'http_status' => 503,
            'resource_type' => 'order',
            'resource_id' => 4,
        ],
        [
            'attempt_id' => 'same-id',
            'http_status' => 201,
            'resource_type' => 'order',
            'resource_id' => 4,
        ],
    ]);

    $result = PersistedEvidenceEvaluator::evaluateHistorical($attempts);

    expect($result['incomplete'])->toBeTrue()
        ->and($result['safety_result'])->toBe('inconclusive')
        ->and($result['operation_safe'])->toBeFalse()
        ->and($result['resource_ids'])->toBe([]);
});

test('complete pair evaluation distinguishes safe unsafe and inconclusive', function () {
    $safe = PersistedEvidenceEvaluator::evaluateCompletePair(
        new ReplayAttempt(['http_status' => 503, 'resource_type' => 'order', 'resource_id' => 1]),
        new ReplayAttempt(['http_status' => 200, 'resource_type' => 'order', 'resource_id' => 1]),
    );

    $unsafe = PersistedEvidenceEvaluator::evaluateCompletePair(
        new ReplayAttempt(['http_status' => 503, 'resource_type' => 'order', 'resource_id' => 1]),
        new ReplayAttempt(['http_status' => 201, 'resource_type' => 'order', 'resource_id' => 2]),
    );

    $inconclusive = PersistedEvidenceEvaluator::evaluateCompletePair(
        new ReplayAttempt(['http_status' => 500, 'resource_type' => 'order', 'resource_id' => 1]),
        new ReplayAttempt(['http_status' => 200, 'resource_type' => 'order', 'resource_id' => 1]),
    );

    expect($safe['safety_result'])->toBe('safe')
        ->and($safe['operation_safe'])->toBeTrue();
    expect($unsafe['safety_result'])->toBe('unsafe')
        ->and($unsafe['operation_safe'])->toBeFalse();
    expect($inconclusive['safety_result'])->toBe('inconclusive')
        ->and($inconclusive['operation_safe'])->toBeFalse();
});
