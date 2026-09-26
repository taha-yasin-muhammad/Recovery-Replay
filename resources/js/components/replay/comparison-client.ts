import { parseRunData } from '@/components/replay/replay-client';
import {
    readRunSummary,
    type HistoryListMeta,
} from '@/components/replay/history-client';
import type { RunData, RunSummary } from '@/components/replay/types';

export interface ComparisonSummary {
    comparison_id: string;
    resource_type: string;
    before_run_id: string;
    after_run_id: string;
    created_at: string | null;
}

export interface ComparisonDetail {
    comparison_id: string;
    resource_type: string;
    before_run_id: string;
    after_run_id: string;
    created_at: string | null;
    before: { data: RunData; summary: RunSummary };
    after: { data: RunData; summary: RunSummary };
}

export interface ComparisonListResponse {
    data: ComparisonSummary[];
    meta: HistoryListMeta;
}

export interface SaveComparisonResult {
    saved: boolean;
    comparison_id: string | null;
    error: string | null;
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

function readComparisonSummary(value: unknown): ComparisonSummary | null {
    if (
        !isRecord(value) ||
        typeof value.comparison_id !== 'string' ||
        typeof value.resource_type !== 'string' ||
        typeof value.before_run_id !== 'string' ||
        typeof value.after_run_id !== 'string'
    ) {
        return null;
    }

    const createdAt =
        value.created_at === null || typeof value.created_at === 'string'
            ? value.created_at
            : undefined;

    if (createdAt === undefined) {
        return null;
    }

    return {
        comparison_id: value.comparison_id,
        resource_type: value.resource_type,
        before_run_id: value.before_run_id,
        after_run_id: value.after_run_id,
        created_at: createdAt,
    };
}

function parseComparisonList(value: unknown): ComparisonListResponse | null {
    if (
        !isRecord(value) ||
        !Array.isArray(value.data) ||
        !isRecord(value.meta)
    ) {
        return null;
    }

    const data = value.data.map(readComparisonSummary);

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
        data: data.filter((item): item is ComparisonSummary => item !== null),
        meta: {
            current_page: meta.current_page,
            last_page: meta.last_page,
            per_page: meta.per_page,
            total: meta.total,
        },
    };
}

function readRunSide(
    value: unknown,
): { data: RunData; summary: RunSummary } | null {
    if (!isRecord(value)) {
        return null;
    }

    const data = parseRunData(value);

    if (data === null) {
        return null;
    }

    const summary = readRunSummary(value.summary);

    if (summary === null) {
        return null;
    }

    return { data, summary };
}

function parseComparisonDetail(value: unknown): ComparisonDetail | null {
    if (
        !isRecord(value) ||
        typeof value.comparison_id !== 'string' ||
        typeof value.resource_type !== 'string' ||
        typeof value.before_run_id !== 'string' ||
        typeof value.after_run_id !== 'string'
    ) {
        return null;
    }

    const createdAt =
        value.created_at === null || typeof value.created_at === 'string'
            ? value.created_at
            : undefined;

    if (createdAt === undefined) {
        return null;
    }

    const before = readRunSide(value.before);
    const after = readRunSide(value.after);

    if (before === null || after === null) {
        return null;
    }

    return {
        comparison_id: value.comparison_id,
        resource_type: value.resource_type,
        before_run_id: value.before_run_id,
        after_run_id: value.after_run_id,
        created_at: createdAt,
        before,
        after,
    };
}

export async function fetchComparisonList(options: {
    page?: number;
    perPage?: number;
}): Promise<ComparisonListResponse> {
    const params = new URLSearchParams();
    params.set('page', String(options.page ?? 1));
    params.set('per_page', String(options.perPage ?? 20));

    const response = await fetch(
        `/api/replay-comparisons?${params.toString()}`,
        {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        },
    );

    const body = parseBody(await response.text());

    if (!response.ok) {
        throw new Error(
            `Comparison list failed with status ${response.status}`,
        );
    }

    const parsed = parseComparisonList(body);

    if (parsed === null) {
        throw new Error('Comparison list response was not valid.');
    }

    return parsed;
}

export async function fetchComparison(
    comparisonId: string,
): Promise<ComparisonDetail> {
    const response = await fetch(
        `/api/replay-comparisons/${encodeURIComponent(comparisonId)}`,
        {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        },
    );

    const body = parseBody(await response.text());

    if (response.status === 404) {
        throw new Error(
            `No saved comparison found for comparison_id ${comparisonId}.`,
        );
    }

    if (!response.ok) {
        throw new Error(
            `Comparison fetch failed for ${comparisonId} with status ${response.status}`,
        );
    }

    const parsed = parseComparisonDetail(body);

    if (parsed === null) {
        throw new Error(
            `Comparison ${comparisonId} response did not match expected shape.`,
        );
    }

    return parsed;
}

export async function saveComparison(
    beforeRunId: string,
    afterRunId: string,
): Promise<SaveComparisonResult> {
    const response = await fetch('/api/replay-comparisons', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            before_run_id: beforeRunId,
            after_run_id: afterRunId,
        }),
    });

    const body = parseBody(await response.text());

    if (!isRecord(body)) {
        throw new Error('Save comparison returned an unexpected response.');
    }

    return {
        saved: body.saved === true,
        comparison_id:
            typeof body.comparison_id === 'string' ? body.comparison_id : null,
        error: typeof body.error === 'string' ? body.error : null,
    };
}
