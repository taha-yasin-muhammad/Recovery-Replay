<?php

namespace App\Replay\Scenarios;

use Illuminate\Support\Str;

/**
 * Protected reservation scenario.
 *
 * Each attempt calls the idempotency-protected /api/reservations/protected
 * endpoint in-process, supplying the same idempotency_key for both passes.
 * A retry after a 503 must return the same reservation rather than creating a duplicate.
 */
class ProtectedReservationScenario extends VulnerableReservationScenario
{
    /** Shared idempotency key is generated once per scenario instance. */
    private readonly string $idempotencyKey;

    public function __construct()
    {
        $this->idempotencyKey = 'idem-'.Str::random(12);
    }

    public function label(): string
    {
        return 'reservation (protected)';
    }

    /**
     * @return array{attempt_id: string, http_status: int, resource_type: string|null, resource_id: int|null, order_id: int|null, response_body: array<string, mixed>}
     */
    public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
    {
        return $this->dispatch('/api/reservations/protected', [
            'operation_id' => $operationId,
            'idempotency_key' => $this->idempotencyKey,
            'run_id' => $runId,
            'attempt_id' => $attemptId,
            'inject_fault' => $injectFault,
        ], $attemptId);
    }
}
