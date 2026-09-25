import type {
    ClientHttpResponse,
    PersistedResource,
    ReplayAttempt,
    RunData,
    ScenarioDomain,
    ScenarioKind,
    ScenarioResult,
} from '@/components/replay/types';

const ENDPOINTS: Record<ScenarioDomain, Record<ScenarioKind, string>> = {
    checkout: {
        vulnerable: '/api/checkout',
        protected: '/api/checkout/protected',
    },
    reservation: {
        vulnerable: '/api/reservations',
        protected: '/api/reservations/protected',
    },
};

interface AttemptPayload {
    operation_id: string;
    run_id: string;
    attempt_id: string;
    inject_fault: boolean;
    idempotency_key?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseBody(text: string): unknown {
    if (text === '') {
        return null;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function describeBody(body: unknown): string {
    if (typeof body === 'string') {
        return body.slice(0, 200);
    }

    try {
        return JSON.stringify(body).slice(0, 200);
    } catch {
        return '';
    }
}

async function postJson(
    url: string,
    payload: AttemptPayload,
): Promise<{ status: number; body: unknown }> {
    let response: Response;

    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Request to ${url} failed: ${message}`);
    }

    const body = parseBody(await response.text());

    if (!response.ok && response.status !== 503) {
        const detail = describeBody(body);
        throw new Error(
            `Unexpected HTTP ${response.status} from ${url}${detail ? `: ${detail}` : ''}`,
        );
    }

    return { status: response.status, body };
}

function readNullableNumber(value: unknown): number | null | undefined {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'number') {
        return value;
    }

    return undefined;
}

function readNullableString(value: unknown): string | null | undefined {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    return undefined;
}

function readAttempt(value: unknown): ReplayAttempt | null {
    if (!isRecord(value)) {
        return null;
    }

    const orderId = readNullableNumber(value.order_id);
    const resourceId = readNullableNumber(value.resource_id);
    const resourceType = readNullableString(value.resource_type);

    if (
        typeof value.id !== 'number' ||
        typeof value.run_id !== 'string' ||
        typeof value.attempt_id !== 'string' ||
        typeof value.operation_id !== 'string' ||
        orderId === undefined ||
        resourceId === undefined ||
        resourceType === undefined ||
        typeof value.http_status !== 'number' ||
        typeof value.order_count_after !== 'number' ||
        typeof value.attempted_at !== 'string'
    ) {
        return null;
    }

    return {
        id: value.id,
        run_id: value.run_id,
        attempt_id: value.attempt_id,
        operation_id: value.operation_id,
        order_id: orderId,
        resource_type: resourceType,
        resource_id: resourceId,
        http_status: value.http_status,
        order_count_after: value.order_count_after,
        attempted_at: value.attempted_at,
    };
}

function isPersistedResource(value: unknown): value is PersistedResource {
    return isRecord(value) && typeof value.id === 'number';
}

function readResources(value: unknown): PersistedResource[] | null {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value) || !value.every(isPersistedResource)) {
        return null;
    }

    return value;
}

export function parseRunData(value: unknown): RunData | null {
    if (!isRecord(value) || typeof value.run_id !== 'string') {
        return null;
    }

    if (!Array.isArray(value.attempts)) {
        return null;
    }

    const attempts = value.attempts.map(readAttempt);

    if (attempts.some((attempt) => attempt === null)) {
        return null;
    }

    const orders = readResources(value.orders);
    const reservations = readResources(value.reservations);

    if (orders === null || reservations === null) {
        return null;
    }

    return {
        run_id: value.run_id,
        attempts: attempts.filter(
            (attempt): attempt is ReplayAttempt => attempt !== null,
        ),
        orders,
        reservations,
    };
}

async function fetchEvidence(runId: string): Promise<RunData> {
    const response = await fetch(`/api/replay-runs/${runId}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
    });

    const body = parseBody(await response.text());

    if (!response.ok) {
        throw new Error(
            `Evidence fetch failed for run ${runId} with status ${response.status}`,
        );
    }

    const data = parseRunData(body);

    if (data === null) {
        throw new Error(
            `Evidence for run ${runId} did not include attempt records.`,
        );
    }

    return data;
}

export async function runScenario(
    domain: ScenarioDomain,
    kind: ScenarioKind,
    onStep: (step: string) => void,
): Promise<ScenarioResult> {
    const runId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const attemptId1 = crypto.randomUUID();
    const attemptId2 = crypto.randomUUID();
    const url = ENDPOINTS[domain][kind];
    const idempotencyKey =
        kind === 'protected' ? crypto.randomUUID() : undefined;

    const base = {
        operation_id: operationId,
        run_id: runId,
    };

    onStep('Attempt 1 — sending the fault injection…');

    const first = await postJson(url, {
        ...base,
        attempt_id: attemptId1,
        inject_fault: true,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });

    onStep('Attempt 2 — sending the retry…');

    const second = await postJson(url, {
        ...base,
        attempt_id: attemptId2,
        inject_fault: false,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });

    if (second.status !== 200 && second.status !== 201) {
        throw new Error(
            `Retry returned HTTP ${second.status}. The retry is expected to complete with HTTP 200 or 201.`,
        );
    }

    onStep('Fetching replay evidence…');

    const data = await fetchEvidence(runId);
    const clientResponses: ClientHttpResponse[] = [
        {
            attempt_id: attemptId1,
            http_status: first.status,
            body: first.body,
        },
        {
            attempt_id: attemptId2,
            http_status: second.status,
            body: second.body,
        },
    ];

    return { data, clientResponses };
}
