import { parseRunData } from '@/components/replay/replay-client';
import type {
    RunData,
    RunSummary,
    SafetyResult,
} from '@/components/replay/types';

export interface HistoryListMeta {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export interface HistoryListResponse {
    data: RunSummary[];
    meta: HistoryListMeta;
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

function isSafetyResult(value: unknown): value is SafetyResult {
    return value === 'safe' || value === 'unsafe' || value === 'inconclusive';
}

function readRunSummary(value: unknown): RunSummary | null {
    if (!isRecord(value) || typeof value.run_id !== 'string') {
        return null;
    }

    if (
        typeof value.attempt_count !== 'number' ||
        typeof value.resource_count !== 'number' ||
        typeof value.reproduction_succeeded !== 'boolean' ||
        typeof value.operation_safe !== 'boolean' ||
        typeof value.duplicate_resources !== 'boolean' ||
        typeof value.same_resource_on_retry !== 'boolean' ||
        typeof value.incomplete !== 'boolean' ||
        !isSafetyResult(value.safety_result) ||
        !Array.isArray(value.resource_ids) ||
        !value.resource_ids.every((id) => typeof id === 'number')
    ) {
        return null;
    }

    const resourceType =
        value.resource_type === null || typeof value.resource_type === 'string'
            ? value.resource_type
            : undefined;
    const recordedAt =
        value.recorded_at === null || typeof value.recorded_at === 'string'
            ? value.recorded_at
            : undefined;

    if (resourceType === undefined || recordedAt === undefined) {
        return null;
    }

    return {
        run_id: value.run_id,
        resource_type: resourceType,
        attempt_count: value.attempt_count,
        resource_count: value.resource_count,
        recorded_at: recordedAt,
        reproduction_succeeded: value.reproduction_succeeded,
        operation_safe: value.operation_safe,
        duplicate_resources: value.duplicate_resources,
        same_resource_on_retry: value.same_resource_on_retry,
        safety_result: value.safety_result,
        incomplete: value.incomplete,
        resource_ids: value.resource_ids,
    };
}

export function parseHistoryList(value: unknown): HistoryListResponse | null {
    if (
        !isRecord(value) ||
        !Array.isArray(value.data) ||
        !isRecord(value.meta)
    ) {
        return null;
    }

    const data = value.data.map(readRunSummary);

    if (data.some((item) => item === null)) {
        return null;
    }

    const meta = value.meta;

    if (
        typeof meta.current_page !== 'number' ||
        typeof meta.last_page !== 'number' ||
        typeof meta.per_page !== 'number' ||
        typeof meta.total !== 'number'
    ) {
        return null;
    }

    return {
        data: data.filter((item): item is RunSummary => item !== null),
        meta: {
            current_page: meta.current_page,
            last_page: meta.last_page,
            per_page: meta.per_page,
            total: meta.total,
        },
    };
}

export async function fetchRunHistory(options: {
    page?: number;
    perPage?: number;
    runId?: string;
}): Promise<HistoryListResponse> {
    const params = new URLSearchParams();
    params.set('page', String(options.page ?? 1));
    params.set('per_page', String(options.perPage ?? 20));

    if (options.runId && options.runId.trim() !== '') {
        params.set('run_id', options.runId.trim());
    }

    const response = await fetch(`/api/replay-runs?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
    });

    const body = parseBody(await response.text());

    if (!response.ok) {
        throw new Error(
            `Run history list failed with status ${response.status}`,
        );
    }

    const parsed = parseHistoryList(body);

    if (parsed === null) {
        throw new Error('Run history list response was not valid.');
    }

    return parsed;
}

export interface HistoricalRunDetail {
    data: RunData;
    summary: RunSummary;
}

export async function fetchHistoricalRun(
    runId: string,
): Promise<HistoricalRunDetail> {
    const response = await fetch(
        `/api/replay-runs/${encodeURIComponent(runId)}`,
        {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        },
    );

    const body = parseBody(await response.text());

    if (response.status === 404) {
        throw new Error(`No replay evidence found for run ${runId}.`);
    }

    if (!response.ok) {
        throw new Error(
            `Historical run fetch failed for ${runId} with status ${response.status}`,
        );
    }

    const data = parseRunData(body);

    if (data === null) {
        throw new Error(
            `Evidence for run ${runId} did not include attempt records.`,
        );
    }

    if (!isRecord(body) || body.summary === undefined) {
        throw new Error(`Evidence for run ${runId} did not include a summary.`);
    }

    const summary = readRunSummary(body.summary);

    if (summary === null) {
        throw new Error(`Evidence summary for run ${runId} was not valid.`);
    }

    return { data, summary };
}
