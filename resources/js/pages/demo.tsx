import { Head } from '@inertiajs/react';
import { useCallback, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReplayAttempt {
    id: number;
    run_id: string;
    attempt_id: string;
    operation_id: string;
    order_id: number;
    http_status: number;
    order_count_after: number;
    attempted_at: string;
}

interface Order {
    id: number;
    operation_id: string;
    status: string;
    created_at: string;
}

interface RunData {
    run_id: string;
    attempts: ReplayAttempt[];
    orders: Order[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
    return crypto.randomUUID();
}

function shortId(id: string): string {
    return id.slice(0, 8) + '…';
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    });
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number }) {
    const isOk = status >= 200 && status < 300;
    const isError = status >= 500;
    const base =
        'inline-block rounded px-2 py-0.5 text-xs font-mono font-semibold';
    const colour = isOk
        ? 'bg-green-100 text-green-800'
        : isError
          ? 'bg-red-100 text-red-800'
          : 'bg-yellow-100 text-yellow-800';
    return <span className={`${base} ${colour}`}>{status}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ScenarioState =
    | { phase: 'idle' }
    | { phase: 'running'; step: string }
    | { phase: 'done'; data: RunData }
    | { phase: 'error'; message: string };

export default function Demo() {
    const [state, setState] = useState<ScenarioState>({ phase: 'idle' });

    const runScenario = useCallback(async () => {
        const runId = uuid();
        const operationId = uuid();

        setState({ phase: 'running', step: 'Attempt 1 — injecting fault…' });

        try {
            // ── Attempt 1: inject fault ───────────────────────────────────
            const attempt1 = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation_id: operationId,
                    run_id: runId,
                    attempt_id: uuid(),
                    inject_fault: true,
                }),
            });

            // We expect 503 — anything else is unexpected but we continue.
            if (attempt1.status !== 503) {
                console.warn(
                    `Expected 503 but got ${attempt1.status} on attempt 1`,
                );
            }

            setState({
                phase: 'running',
                step: 'Attempt 2 — retrying without fault…',
            });

            // ── Attempt 2: retry, no fault ────────────────────────────────
            const attempt2 = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation_id: operationId,
                    run_id: runId,
                    attempt_id: uuid(),
                    inject_fault: false,
                }),
            });

            if (!attempt2.ok) {
                throw new Error(
                    `Attempt 2 failed with status ${attempt2.status}`,
                );
            }

            setState({ phase: 'running', step: 'Fetching replay evidence…' });

            // ── Fetch evidence ────────────────────────────────────────────
            const evidenceRes = await fetch(`/api/replay-runs/${runId}`);

            if (!evidenceRes.ok) {
                throw new Error(
                    `Evidence fetch failed with status ${evidenceRes.status}`,
                );
            }

            const data: RunData = await evidenceRes.json();

            setState({ phase: 'done', data });
        } catch (err) {
            setState({
                phase: 'error',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }, []);

    return (
        <>
            <Head title="Replay Timeline Demo" />

            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto max-w-3xl">
                    {/* Header */}
                    <div className="mb-6">
                        <h1 className="text-xl font-semibold text-gray-900">
                            Recovery Replay — Timeline Demo
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Demonstrates the duplicate-order bug that occurs
                            when a checkout request fails after the order is
                            already persisted and the customer retries.
                        </p>
                    </div>

                    {/* Run button */}
                    <button
                        onClick={runScenario}
                        disabled={state.phase === 'running'}
                        className="mb-6 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                        {state.phase === 'running'
                            ? 'Running…'
                            : 'Run Failure Scenario'}
                    </button>

                    {/* Loading */}
                    {state.phase === 'running' && (
                        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-gray-800" />
                            {state.step}
                        </div>
                    )}

                    {/* Error */}
                    {state.phase === 'error' && (
                        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                            <strong>Error:</strong> {state.message}
                        </div>
                    )}

                    {/* Results */}
                    {state.phase === 'done' && <Results data={state.data} />}
                </div>
            </div>
        </>
    );
}

// ── Results component ─────────────────────────────────────────────────────────

function Results({ data }: { data: RunData }) {
    return (
        <div className="space-y-6">
            {/* Run meta */}
            <div className="rounded border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                <span className="font-medium text-gray-700">Run ID: </span>
                <span className="font-mono">{data.run_id}</span>
            </div>

            {/* Two-column perspectives */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <CustomerView attempts={data.attempts} />
                <ServerView orders={data.orders} attempts={data.attempts} />
            </div>

            {/* Duplicate warning */}
            {data.orders.length > 1 && (
                <div className="rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                    <strong>Duplicate detected:</strong> {data.orders.length}{' '}
                    orders were created for the same operation — this is the bug
                    that idempotency keys will fix.
                </div>
            )}
        </div>
    );
}

// ── Customer view ─────────────────────────────────────────────────────────────

function CustomerView({ attempts }: { attempts: ReplayAttempt[] }) {
    return (
        <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Customer View{' '}
                <span className="font-normal text-gray-400">
                    (HTTP responses)
                </span>
            </h2>
            <div className="overflow-hidden rounded border border-gray-200 bg-white">
                <table className="w-full text-xs">
                    <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
                        <tr>
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">Attempt ID</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-left">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {attempts.map((a, i) => (
                            <tr
                                key={a.attempt_id}
                                className="border-t border-gray-100"
                            >
                                <td className="px-3 py-2 text-gray-400">
                                    {i + 1}
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-600">
                                    {shortId(a.attempt_id)}
                                </td>
                                <td className="px-3 py-2">
                                    <StatusBadge status={a.http_status} />
                                </td>
                                <td className="px-3 py-2 text-gray-400">
                                    {formatTime(a.attempted_at)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

// ── Server view ───────────────────────────────────────────────────────────────

function ServerView({
    orders,
    attempts,
}: {
    orders: Order[];
    attempts: ReplayAttempt[];
}) {
    // Build a map from order_id → attempt for the timeline column
    const attemptByOrder = new Map(attempts.map((a) => [a.order_id, a]));

    return (
        <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Server View{' '}
                <span className="font-normal text-gray-400">
                    (persisted orders)
                </span>
            </h2>
            <div className="overflow-hidden rounded border border-gray-200 bg-white">
                <table className="w-full text-xs">
                    <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
                        <tr>
                            <th className="px-3 py-2 text-left">Order ID</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-right">Count</th>
                            <th className="px-3 py-2 text-left">Attempt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((o) => {
                            const attempt = attemptByOrder.get(o.id);
                            return (
                                <tr
                                    key={o.id}
                                    className="border-t border-gray-100"
                                >
                                    <td className="px-3 py-2 font-mono text-gray-600">
                                        #{o.id}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">
                                        {o.status}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                                        {attempt?.order_count_after ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {attempt ? (
                                            <StatusBadge
                                                status={attempt.http_status}
                                            />
                                        ) : (
                                            <span className="text-gray-300">
                                                —
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
