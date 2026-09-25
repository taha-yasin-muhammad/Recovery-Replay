import type {
    PersistedResource,
    ReplayAttempt,
    ResourceRelation,
    RunData,
    ScenarioDomain,
    Verification,
} from '@/components/replay/types';

/**
 * Mirrors App\Replay\ReplayRunner: resource ids come from resource_id, with
 * order_id only when resource_id is null. Flags use that id set plus the
 * recorded HTTP statuses in display order.
 */
export function resourceIdOf(attempt: ReplayAttempt): number | null {
    const raw = attempt.resource_id ?? attempt.order_id;

    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
        return raw;
    }

    return null;
}

export function orderAttempts(attempts: ReplayAttempt[]): ReplayAttempt[] {
    return [...attempts].sort((left, right) => {
        const leftTime = Date.parse(left.attempted_at);
        const rightTime = Date.parse(right.attempted_at);
        const leftStamp = Number.isNaN(leftTime) ? 0 : leftTime;
        const rightStamp = Number.isNaN(rightTime) ? 0 : rightTime;

        if (leftStamp !== rightStamp) {
            return leftStamp - rightStamp;
        }

        return left.id - right.id;
    });
}

export function attemptsShareTimestamp(attempts: ReplayAttempt[]): boolean {
    const ordered = orderAttempts(attempts);

    if (ordered.length < 2) {
        return false;
    }

    const first = ordered[0]?.attempted_at;

    return ordered.every((attempt) => attempt.attempted_at === first);
}

export function deriveVerification(attempts: ReplayAttempt[]): Verification {
    const ordered = orderAttempts(attempts);
    const resourceIds = [
        ...new Set(
            ordered
                .map((attempt) => resourceIdOf(attempt))
                .filter((id): id is number => id !== null),
        ),
    ].sort((left, right) => left - right);

    const duplicateResources = resourceIds.length > 1;
    const sameResourceOnRetry = resourceIds.length === 1;
    const first = ordered[0];
    const second = ordered[1];
    const reproductionSucceeded = Boolean(
        first &&
        second &&
        first.http_status === 503 &&
        (second.http_status === 200 || second.http_status === 201),
    );

    return {
        reproduction_succeeded: reproductionSucceeded,
        operation_safe: reproductionSucceeded && sameResourceOnRetry,
        duplicate_resources: duplicateResources,
        same_resource_on_retry: sameResourceOnRetry,
        resource_ids: resourceIds,
    };
}

export function formatResourceIdentity(attempt: ReplayAttempt): string {
    const id = resourceIdOf(attempt);

    if (attempt.resource_type && id !== null) {
        return `${attempt.resource_type} ${id}`;
    }

    if (attempt.resource_type) {
        return `${attempt.resource_type} · no resource id`;
    }

    if (id !== null) {
        return `resource ${id}`;
    }

    return 'No resource id';
}

export function explainVerification(attempts: ReplayAttempt[]): string {
    const ordered = orderAttempts(attempts);
    const verification = deriveVerification(ordered);

    if (ordered.length === 0) {
        return 'No replay attempts were recorded. reproduction_succeeded is false and operation_safe is false.';
    }

    const narrative = ordered
        .map((attempt, index) => {
            return `Attempt ${index + 1} recorded HTTP ${attempt.http_status}, ${formatResourceIdentity(attempt)}, count ${attempt.order_count_after}.`;
        })
        .join(' ');

    const idList =
        verification.resource_ids.length === 0
            ? 'none'
            : verification.resource_ids.join(', ');

    let outcome: string;

    if (!verification.reproduction_succeeded) {
        const statuses = ordered
            .map((attempt) => attempt.http_status)
            .join(' then ');
        outcome = `The recorded statuses are ${statuses}, so reproduction_succeeded is false and operation_safe is false.`;
    } else if (verification.operation_safe) {
        outcome = `The recorded resource ids are ${idList}, so same_resource_on_retry is true and operation_safe is true.`;
    } else if (verification.duplicate_resources) {
        outcome = `The recorded resource ids are ${idList}, so duplicate_resources is true and operation_safe is false.`;
    } else {
        outcome = `The recorded resource ids are ${idList}, so same_resource_on_retry is false and operation_safe is false.`;
    }

    return `${narrative} ${outcome}`;
}

export function resourceRelation(
    attempts: ReplayAttempt[],
    index: number,
): ResourceRelation {
    const current = attempts[index];

    if (!current) {
        return 'unrecorded';
    }

    if (resourceIdOf(current) === null) {
        return 'unrecorded';
    }

    if (index === 0) {
        return 'initial';
    }

    const currentId = resourceIdOf(current);
    const seen = attempts
        .slice(0, index)
        .some((attempt) => resourceIdOf(attempt) === currentId);

    return seen ? 'reused' : 'new';
}

export function attemptLabel(index: number, total: number): string {
    if (total === 2 && index === 0) {
        return 'Initial attempt';
    }

    if (total === 2 && index === 1) {
        return 'Retry';
    }

    return `Attempt ${index + 1}`;
}

export function findPersistedResource(
    attempt: ReplayAttempt,
    data: Pick<RunData, 'orders' | 'reservations'>,
): { kind: string; resource: PersistedResource } | null {
    const id = resourceIdOf(attempt);

    if (id === null) {
        return null;
    }

    if (attempt.resource_type === 'reservation') {
        const resource = data.reservations.find((item) => item.id === id);

        return resource ? { kind: 'reservation', resource } : null;
    }

    if (attempt.resource_type === 'order' || attempt.resource_type === null) {
        const resource = data.orders.find((item) => item.id === id);

        return resource ? { kind: 'order', resource } : null;
    }

    const order = data.orders.find((item) => item.id === id);

    if (order) {
        return { kind: attempt.resource_type, resource: order };
    }

    const reservation = data.reservations.find((item) => item.id === id);

    if (reservation) {
        return { kind: attempt.resource_type, resource: reservation };
    }

    return null;
}

const PERSISTED_FIELDS = [
    'id',
    'operation_id',
    'status',
    'idempotency_key',
    'created_at',
    'updated_at',
] as const;

export function persistedFieldEntries(
    resource: PersistedResource,
): { key: string; value: string }[] {
    return PERSISTED_FIELDS.flatMap((key) => {
        if (!Object.prototype.hasOwnProperty.call(resource, key)) {
            return [];
        }

        const value = resource[key];

        if (value === undefined) {
            return [];
        }

        if (value === null) {
            return [{ key, value: 'null' }];
        }

        return [{ key, value: String(value) }];
    });
}

export function persistedCount(
    domain: ScenarioDomain,
    data: Pick<RunData, 'orders' | 'reservations'>,
): number {
    return domain === 'checkout'
        ? data.orders.length
        : data.reservations.length;
}

export function persistedNoun(domain: ScenarioDomain): string {
    return domain === 'checkout' ? 'Orders' : 'Reservations';
}
