import { Head, Link } from '@inertiajs/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    fetchHistoricalRun,
    fetchRunHistory,
    type HistoryListMeta,
} from '@/components/replay/history-client';
import { HistoricalRunWorkspace } from '@/components/replay/historical-run-workspace';
import type {
    InvestigationStep,
    RunData,
    RunSummary,
    SafetyResult,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

function SafetyBadge({ result }: { result: SafetyResult }) {
    return (
        <span
            className={cn(
                'rounded-md px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase',
                result === 'safe' && 'bg-safe-soft text-safe',
                result === 'unsafe' && 'bg-danger-soft text-danger',
                result === 'inconclusive' && 'bg-warn-soft text-warn',
            )}
        >
            {result}
        </span>
    );
}

function formatTimestamp(value: string | null): string {
    if (value === null) {
        return 'unavailable';
    }

    const parsed = Date.parse(value);

    if (Number.isNaN(parsed)) {
        return value;
    }

    return new Date(parsed).toLocaleString();
}

type View =
    | { mode: 'list' }
    | {
          mode: 'detail';
          summary: RunSummary;
          data: RunData;
      };

export default function History() {
    const [runs, setRuns] = useState<RunSummary[]>([]);
    const [meta, setMeta] = useState<HistoryListMeta | null>(null);
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState('');
    const [activeSearch, setActiveSearch] = useState('');
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [view, setView] = useState<View>({ mode: 'list' });
    const [step, setStep] = useState<InvestigationStep>('initial');

    const loadList = useCallback(async (nextPage: number, runId: string) => {
        setListLoading(true);
        setListError(null);

        try {
            const response = await fetchRunHistory({
                page: nextPage,
                perPage: 10,
                runId: runId || undefined,
            });
            setRuns(response.data);
            setMeta(response.meta);
            setPage(response.meta.current_page);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setListError(message);
            setRuns([]);
            setMeta(null);
        } finally {
            setListLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadList(page, activeSearch);
    }, [loadList, page, activeSearch]);

    function onSearchSubmit(event: FormEvent) {
        event.preventDefault();
        setView({ mode: 'list' });
        setPage(1);
        setActiveSearch(searchInput.trim());
    }

    function clearSearch() {
        setSearchInput('');
        setActiveSearch('');
        setPage(1);
        setView({ mode: 'list' });
    }

    async function openRun(runId: string) {
        setDetailLoading(true);
        setDetailError(null);
        setStep('initial');

        try {
            const detail = await fetchHistoricalRun(runId);
            setView({
                mode: 'detail',
                summary: detail.summary,
                data: detail.data,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setDetailError(message);
            setView({ mode: 'list' });
        } finally {
            setDetailLoading(false);
        }
    }

    return (
        <>
            <Head title="Run History" />

            <div className="relative min-h-screen overflow-x-hidden bg-surface text-ink">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(15,118,110,0.12),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(180,83,9,0.06),transparent)]"
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,32,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,32,0.04)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] [background-size:48px_48px] opacity-[0.35]"
                />

                <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
                    <header className="replay-fade-up mb-6 flex flex-col gap-4 border-b border-line pb-6 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-8">
                        <div className="max-w-2xl min-w-0">
                            <p className="font-mono text-[0.7rem] tracking-[0.18em] text-accent uppercase">
                                Recovery Replay
                            </p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                                Run History
                            </h1>
                            <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-[0.95rem]">
                                Find previously recorded replay runs and inspect
                                their evidence. Opening a run never re-executes
                                a scenario.
                            </p>
                        </div>
                        <Link
                            href="/demo"
                            className="inline-flex items-center justify-center rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                            Investigation Workspace
                        </Link>
                    </header>

                    {view.mode === 'list' && (
                        <div className="replay-fade-up-delay flex flex-col gap-6">
                            <form
                                onSubmit={onSearchSubmit}
                                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                            >
                                <div className="min-w-0 flex-1">
                                    <label
                                        htmlFor="run-id-search"
                                        className="mb-1.5 block text-xs font-medium text-ink-faint"
                                    >
                                        Exact run_id
                                    </label>
                                    <input
                                        id="run-id-search"
                                        type="text"
                                        value={searchInput}
                                        onChange={(event) =>
                                            setSearchInput(event.target.value)
                                        }
                                        placeholder="Paste a full run_id"
                                        className="w-full rounded-xl border border-line bg-surface-raised px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                    >
                                        Search
                                    </button>
                                    {activeSearch !== '' && (
                                        <button
                                            type="button"
                                            onClick={clearSearch}
                                            className="rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </form>

                            {listError && (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                                >
                                    {listError}
                                </div>
                            )}

                            {detailError && (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                                >
                                    {detailError}
                                </div>
                            )}

                            {listLoading ? (
                                <p className="text-sm text-ink-muted">
                                    Loading recorded runs…
                                </p>
                            ) : runs.length === 0 ? (
                                <p
                                    role="status"
                                    className="rounded-xl border border-dashed border-line-strong bg-surface-raised/60 px-4 py-8 text-center text-sm text-ink-faint"
                                >
                                    {activeSearch !== ''
                                        ? 'No run matched that exact run_id.'
                                        : 'No recorded runs yet. Run a comparison from the Investigation Workspace first.'}
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-2xl border border-line bg-surface-raised/90">
                                    <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-line text-xs text-ink-faint">
                                                <th className="px-4 py-3 font-medium">
                                                    run_id
                                                </th>
                                                <th className="px-4 py-3 font-medium">
                                                    Type
                                                </th>
                                                <th className="px-4 py-3 font-medium">
                                                    Attempts
                                                </th>
                                                <th className="px-4 py-3 font-medium">
                                                    Resources
                                                </th>
                                                <th className="px-4 py-3 font-medium">
                                                    Recorded
                                                </th>
                                                <th className="px-4 py-3 font-medium">
                                                    Safety
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {runs.map((run) => (
                                                <tr
                                                    key={run.run_id}
                                                    className="border-b border-line/70 last:border-b-0"
                                                >
                                                    <td className="px-4 py-3 align-top">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                void openRun(
                                                                    run.run_id,
                                                                );
                                                            }}
                                                            disabled={
                                                                detailLoading
                                                            }
                                                            className="max-w-[14rem] truncate font-mono text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 sm:max-w-xs"
                                                            title={run.run_id}
                                                        >
                                                            {run.run_id}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 align-top font-mono text-xs text-ink-muted">
                                                        {run.resource_type ??
                                                            'unavailable'}
                                                    </td>
                                                    <td className="px-4 py-3 align-top font-mono text-xs text-ink tabular-nums">
                                                        {run.attempt_count}
                                                    </td>
                                                    <td className="px-4 py-3 align-top font-mono text-xs text-ink tabular-nums">
                                                        {run.resource_count}
                                                    </td>
                                                    <td className="px-4 py-3 align-top font-mono text-xs text-ink-muted">
                                                        {formatTimestamp(
                                                            run.recorded_at,
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 align-top">
                                                        <SafetyBadge
                                                            result={
                                                                run.safety_result
                                                            }
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {meta && meta.last_page > 1 && (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs text-ink-faint">
                                        Page {meta.current_page} of{' '}
                                        {meta.last_page} · {meta.total} runs
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={
                                                listLoading ||
                                                meta.current_page <= 1
                                            }
                                            onClick={() =>
                                                setPage((current) =>
                                                    Math.max(1, current - 1),
                                                )
                                            }
                                            className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                listLoading ||
                                                meta.current_page >=
                                                    meta.last_page
                                            }
                                            onClick={() =>
                                                setPage(
                                                    (current) => current + 1,
                                                )
                                            }
                                            className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}

                            {detailLoading && (
                                <p
                                    className="text-sm text-ink-muted"
                                    role="status"
                                >
                                    Loading historical evidence…
                                </p>
                            )}
                        </div>
                    )}

                    {view.mode === 'detail' && (
                        <div className="replay-fade-up-delay">
                            <HistoricalRunWorkspace
                                summary={view.summary}
                                data={view.data}
                                step={step}
                                onStepChange={setStep}
                                onBack={() => {
                                    setView({ mode: 'list' });
                                    setDetailError(null);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
