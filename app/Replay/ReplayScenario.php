<?php

namespace App\Replay;

/**
 * Contract for a replayable scenario.
 *
 * Implementations execute one attempt of the logical operation and return
 * the raw evidence collected during that execution.
 *
 * @phpstan-type AttemptPayload array{
 *     attempt_id: string,
 *     http_status: int,
 *     order_id: int|null,
 *     response_body: array<string, mixed>,
 * }
 */
interface ReplayScenario
{
    /** Human-readable label shown in terminal output. */
    public function label(): string;

    /**
     * Execute one attempt of this scenario.
     *
     * @return AttemptPayload
     */
    public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array;
}
