import { Head, Link } from '@inertiajs/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    fetchComparisonList,
    fetchComparison,
    type ComparisonSummary,
    type ComparisonDetail,
} from '@/components/replay/comparison-client';
import {
    fetchHistoricalRun,
    fetchRunHistory,
    type HistoryListMeta,
} from '@/components/replay/history-client';
import { HistoricalComparisonWorkspace } from '@/components/replay/historical-comparison-workspace';
import { HistoricalRunWorkspace } from '@/components/replay/historical-run-workspace';
import type {
    InvestigationStep,
    RunData,
    RunSummary,
    SafetyResult,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

type HistoryTab = 'runs' | 'comparisons';

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
          mode: 'run-detail';
          summary: RunSummary;
          data: RunData;
      }
    | {
          mode: 'comparison-detail';
          comparison: ComparisonDetail;
      };

export default function History() {
    const [activeTab, setActiveTab] = useState<HistoryTab>('runs');

    // ── Run history state ─────────────────────────────────────────────────
    const [runs, setRuns] = useState<RunSummary[]>([]);
    const [runMeta, setRunMeta] = useState<HistoryListMeta | null>(null);
    const [runPage, setRunPage] = useState(1);
    const [searchInput, setSearchInput] = useState('');
    const [activeSearch, setActiveSearch] = useState('');
    const [runListLoading, setRunListLoading] = useState(true);
    const [runListError, setRunListError] = useState<string | null>(null);
    const [runDetailLoading, setRunDetailLoading] = useState(false);
    const [runDetailError, setRunDetailError] = useState<string | null>(null);

    // ── Comparison history state ──────────────────────────────────────────
    const [comparisons, setComparisons] = useState<ComparisonSummary[]>([]);
    const [compMeta, setCompMeta] = useState<HistoryListMeta | null>(null);
    const [compPage, setCompPage] = useState(1);
    const [compListLoading, setCompListLoading] = useState(false);
    const [compListError, setCompListError] = useState<string | null>(null);
    const [compDetailLoading, setCompDetailLoading] = useState(false);
    const [compDetailError, setCompDetailError] = useState<string | null>(null);

    const [view, setView] = useState<View>({ mode: 'list' });
    const [step, setStep] = useState<InvestigationStep>('initial');

    // ── Load run list ─────────────────────────────────────────────────────
    const loadRunList = useCallback(async (nextPage: number, runId: string) => {
        setRunListLoading(true);
        setRunListError(null);

        try {
            const response = await fetchRunHistory({
                page: nextPage,
                perPage: 10,
                runId: runId || undefined,
            });
            setRuns(response.data);
            setRunMeta(response.meta);
            setRunPage(response.meta.current_page);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setRunListError(message);
            setRuns([]);
            setRunMeta(null);
        } finally {
            setRunListLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadRunList(runPage, activeSearch);
    }, [loadRunList, runPage, activeSearch]);

    // ── Load comparison list ──────────────────────────────────────────────
    const loadCompList = useCallback(async (nextPage: number) => {
        setCompListLoading(true);
        setCompListError(null);

        try {
            const response = await fetchComparisonList({
                page: nextPage,
                perPage: 10,
            });
            setComparisons(response.data);
            setCompMeta(response.meta);
            setCompPage(response.meta.current_page);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setCompListError(message);
            setComparisons([]);
            setCompMeta(null);
        } finally {
            setCompListLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'comparisons') {
            void loadCompList(compPage);
        }
    }, [loadCompList, compPage, activeTab]);

    // ── Run list handlers ─────────────────────────────────────────────────
    function onSearchSubmit(event: FormEvent) {
        event.preventDefault();
        setView({ mode: 'list' });
        setRunPage(1);
        setActiveSearch(searchInput.trim());
    }

    function clearSearch() {
        setSearchInput('');
        setActiveSearch('');
        setRunPage(1);
        setView({ mode: 'list' });
    }

    async function openRun(runId: string) {
        setRunDetailLoading(true);
        setRunDetailError(null);
        setStep('initial');

        try {
            const detail = await fetchHistoricalRun(runId);
            setView({
                mode: 'run-detail',
                summary: detail.summary,
                data: detail.data,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setRunDetailError(message);
            setView({ mode: 'list' });
        } finally {
            setRunDetailLoading(false);
        }
    }

    // ── Comparison handlers ───────────────────────────────────────────────
    async function openComparison(comparisonId: string) {
        setCompDetailLoading(true);
        setCompDetailError(null);
        setStep('initial');

        try {
            const detail = await fetchComparison(comparisonId);
            setView({ mode: 'comparison-detail', comparison: detail });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setCompDetailError(message);
            setView({ mode: 'list' });
        } finally {
            setCompDetailLoading(false);
        }
    }

    function switchTab(tab: HistoryTab) {
        setActiveTab(tab);
        setView({ mode: 'list' });
        setStep('initial');
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
                                Find previously recorded replay runs and saved
                                comparisons. Opening either never re-executes a
                                scenario.
                            </p>
                        </div>
                        <Link
                            href="/demo"
                            className="inline-flex items-center justify-center rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                            Investigation Workspace
                        </Link>
                    </header>

                    {/* Tab bar */}
                    <div className="replay-fade-up-delay mb-6 flex gap-1 rounded-xl border border-line bg-surface-raised/80 p-1">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'runs'}
                            onClick={() => switchTab('runs')}
                            className={cn(
                                'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                activeTab === 'runs'
                                    ? 'bg-ink text-white'
                                    : 'text-ink-muted hover:bg-surface hover:text-ink',
                            )}
                        >
                            Individual runs
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'comparisons'}
                            onClick={() => switchTab('comparisons')}
                            className={cn(
                                'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                activeTab === 'comparisons'
                                    ? 'bg-ink text-white'
                                    : 'text-ink-muted hover:bg-surface hover:text-ink',
                            )}
                        >
                            Saved comparisons
                        </button>
                    </div>

                    {/* ── Individual runs tab ────────────────────────────────── */}
                    {activeTab === 'runs' && view.mode !== 'run-detail' && (
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

                            {runListError && (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                                >
                                    {runListError}
                                </div>
                            )}

                            {runDetailError && (
                                <div
                                    role="alert"
                                    className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                                >
                                    {runDetailError}
                                </div>
                            )}

                            {runListLoading ? (
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
                                                                runDetailLoading
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

                            {runMeta && runMeta.last_page > 1 && (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs text-ink-faint">
                                        Page {runMeta.current_page} of{' '}
                                        {runMeta.last_page} · {runMeta.total}{' '}
                                        runs
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={
                                                runListLoading ||
                                                runMeta.current_page <= 1
                                            }
                                            onClick={() =>
                                                setRunPage((current) =>
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
                                                runListLoading ||
                                                runMeta.current_page >=
                                                    runMeta.last_page
                                            }
                                            onClick={() =>
                                                setRunPage(
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

                            {runDetailLoading && (
                                <p
                                    className="text-sm text-ink-muted"
                                    role="status"
                                >
                                    Loading historical evidence…
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === 'runs' && view.mode === 'run-detail' && (
                        <div className="replay-fade-up-delay">
                            <HistoricalRunWorkspace
                                summary={view.summary}
                                data={view.data}
                                step={step}
                                onStepChange={setStep}
                                onBack={() => {
                                    setView({ mode: 'list' });
                                    setRunDetailError(null);
                                }}
                            />
                        </div>
                    )}

                    {/* ── Saved comparisons tab ──────────────────────────────── */}
                    {activeTab === 'comparisons' &&
                        view.mode !== 'comparison-detail' && (
                            <div className="replay-fade-up-delay flex flex-col gap-6">
                                {compListError && (
                                    <div
                                        role="alert"
                                        className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                                    >
                                        {compListError}
                                    </div>
                                )}

                                {compDetailError && (
                                    <div
                                        role="alert"
                                        className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                                    >
                                        {compDetailError}
                                    </div>
                                )}

                                {compListLoading ? (
                                    <p className="text-sm text-ink-muted">
                                        Loading saved comparisons…
                                    </p>
                                ) : comparisons.length === 0 ? (
                                    <p
                                        role="status"
                                        className="rounded-xl border border-dashed border-line-strong bg-surface-raised/60 px-4 py-8 text-center text-sm text-ink-faint"
                                    >
                                        No saved comparisons yet. Run a
                                        comparison in the Investigation
                                        Workspace and save it there.
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto rounded-2xl border border-line bg-surface-raised/90">
                                        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-line text-xs text-ink-faint">
                                                    <th className="px-4 py-3 font-medium">
                                                        comparison_id
                                                    </th>
                                                    <th className="px-4 py-3 font-medium">
                                                        Type
                                                    </th>
                                                    <th className="px-4 py-3 font-medium">
                                                        before_run_id
                                                    </th>
                                                    <th className="px-4 py-3 font-medium">
                                                        after_run_id
                                                    </th>
                                                    <th className="px-4 py-3 font-medium">
                                                        Saved
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {comparisons.map(
                                                    (comparison) => (
                                                        <tr
                                                            key={
                                                                comparison.comparison_id
                                                            }
                                                            className="border-b border-line/70 last:border-b-0"
                                                        >
                                                            <td className="px-4 py-3 align-top">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        void openComparison(
                                                                            comparison.comparison_id,
                                                                        );
                                                                    }}
                                                                    disabled={
                                                                        compDetailLoading
                                                                    }
                                                                    className="max-w-[14rem] truncate font-mono text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 sm:max-w-xs"
                                                                    title={
                                                                        comparison.comparison_id
                                                                    }
                                                                >
                                                                    {
                                                                        comparison.comparison_id
                                                                    }
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-3 align-top font-mono text-xs text-ink-muted">
                                                                {
                                                                    comparison.resource_type
                                                                }
                                                            </td>
                                                            <td className="max-w-[10rem] truncate px-4 py-3 align-top font-mono text-xs text-ink-muted">
                                                                <span
                                                                    title={
                                                                        comparison.before_run_id
                                                                    }
                                                                >
                                                                    {
                                                                        comparison.before_run_id
                                                                    }
                                                                </span>
                                                            </td>
                                                            <td className="max-w-[10rem] truncate px-4 py-3 align-top font-mono text-xs text-ink-muted">
                                                                <span
                                                                    title={
                                                                        comparison.after_run_id
                                                                    }
                                                                >
                                                                    {
                                                                        comparison.after_run_id
                                                                    }
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 align-top font-mono text-xs text-ink-muted">
                                                                {formatTimestamp(
                                                                    comparison.created_at,
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ),
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {compMeta && compMeta.last_page > 1 && (
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-xs text-ink-faint">
                                            Page {compMeta.current_page} of{' '}
                                            {compMeta.last_page} ·{' '}
                                            {compMeta.total} comparisons
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={
                                                    compListLoading ||
                                                    compMeta.current_page <= 1
                                                }
                                                onClick={() =>
                                                    setCompPage((current) =>
                                                        Math.max(
                                                            1,
                                                            current - 1,
                                                        ),
                                                    )
                                                }
                                                className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
                                            >
                                                Previous
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    compListLoading ||
                                                    compMeta.current_page >=
                                                        compMeta.last_page
                                                }
                                                onClick={() =>
                                                    setCompPage(
                                                        (current) =>
                                                            current + 1,
                                                    )
                                                }
                                                className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {compDetailLoading && (
                                    <p
                                        className="text-sm text-ink-muted"
                                        role="status"
                                    >
                                        Loading comparison evidence…
                                    </p>
                                )}
                            </div>
                        )}

                    {activeTab === 'comparisons' &&
                        view.mode === 'comparison-detail' && (
                            <div className="replay-fade-up-delay">
                                <HistoricalComparisonWorkspace
                                    comparison={view.comparison}
                                    step={step}
                                    onStepChange={setStep}
                                    onBack={() => {
                                        setView({ mode: 'list' });
                                        setCompDetailError(null);
                                    }}
                                />
                            </div>
                        )}
                </div>
            </div>
        </>
    );
}
