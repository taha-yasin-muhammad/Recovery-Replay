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

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * POST to a checkout endpoint. Returns the Response (does not throw on 503,
 * which is an expected part of the scenario). Throws for unexpected errors.
 */
async function postCheckout(
    url: string,
    body: Record<string, unknown>,
): Promise<Response> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    // 503 is expected (injected fault). Any other non-2xx outside 503 is a
    // genuine problem we should surface rather than swallow.
    if (!res.ok && res.status !== 503) {
        let detail = '';
        try {
            detail = await res.text();
        } catch {
            // ignore
        }
        throw new Error(
            `Unexpected HTTP ${res.status} from ${url}${detail ? ': ' + detail.slice(0, 200) : ''}`,
        );
    }
    return res;
}

async function fetchEvidence(runId: string): Promise<RunData> {
    const res = await fetch(`/api/replay-runs/${runId}`);
    if (!res.ok) {
        throw new Error(`Evidence fetch failed with status ${res.status}`);
    }
    return res.json() as Promise<RunData>;
}

// ── Scenario runners ──────────────────────────────────────────────────────────

type ScenarioKind = 'vulnerable' | 'protected';

type ScenarioState =
    | { phase: 'idle' }
    | { phase: 'running'; step: string }
    | { phase: 'done'; data: RunData }
    | { phase: 'error'; message: string };

async function runVulnerableScenario(
    onStep: (step: string) => void,
): Promise<RunData> {
    const runId = uuid();
    const operationId = uuid();

    onStep('Attempt 1 — injecting fault…');

    await postCheckout('/api/checkout', {
        operation_id: operationId,
        run_id: runId,
        attempt_id: uuid(),
        inject_fault: true,
    });
    // Expected 503 — we consumed it above without throwing.

    onStep('Attempt 2 — retrying without fault…');

    const attempt2 = await postCheckout('/api/checkout', {
        operation_id: operationId,
        run_id: runId,
        attempt_id: uuid(),
        inject_fault: false,
    });

    if (!attempt2.ok) {
        throw new Error(`Retry attempt failed with status ${attempt2.status}`);
    }

    onStep('Fetching replay evidence…');
    return fetchEvidence(runId);
}

async function runProtectedScenario(
    onStep: (step: string) => void,
): Promise<RunData> {
    const runId = uuid();
    const operationId = uuid();
    const idempotencyKey = uuid();

    onStep('Attempt 1 — injecting fault…');

    await postCheckout('/api/checkout/protected', {
        operation_id: operationId,
        idempotency_key: idempotencyKey,
        run_id: runId,
        attempt_id: uuid(),
        inject_fault: true,
    });
    // Expected 503.

    onStep('Attempt 2 — retrying with same idempotency key…');

    const attempt2 = await postCheckout('/api/checkout/protected', {
        operation_id: operationId,
        idempotency_key: idempotencyKey,
        run_id: runId,
        attempt_id: uuid(),
        inject_fault: false,
    });

    if (!attempt2.ok) {
        throw new Error(`Retry attempt failed with status ${attempt2.status}`);
    }

    onStep('Fetching replay evidence…');
    return fetchEvidence(runId);
}

// ── Scenario panel ────────────────────────────────────────────────────────────

interface ScenarioPanelProps {
    kind: ScenarioKind;
    state: ScenarioState;
    onRun: () => void;
}

function ScenarioPanel({ kind, state, onRun }: ScenarioPanelProps) {
    const isVulnerable = kind === 'vulnerable';
    const label = isVulnerable
        ? 'Run Vulnerable Scenario'
        : 'Run Protected Scenario';
    const headerBg = isVulnerable
        ? 'bg-red-50 border-red-200'
        : 'bg-green-50 border-green-200';
    const headerText = isVulnerable ? 'text-red-800' : 'text-green-800';
    const badgeColour = isVulnerable
        ? 'bg-red-100 text-red-700'
        : 'bg-green-100 text-green-700';
    const badgeLabel = isVulnerable
        ? 'BEFORE — No Idempotency'
        : 'AFTER — Idempotency Protected';
    const buttonColour = isVulnerable
        ? 'bg-red-700 hover:bg-red-600'
        : 'bg-green-700 hover:bg-green-600';

    return (
        <div className="flex flex-col gap-4">
            {/* Panel header */}
            <div className={`rounded border px-4 py-3 ${headerBg}`}>
                <div className="flex items-center justify-between">
                    <span
                        className={`text-xs font-semibold tracking-wide uppercase ${headerText}`}
                    >
                        {isVulnerable
                            ? '❌ Vulnerable checkout'
                            : '✅ Protected checkout'}
                    </span>
                    <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeColour}`}
                    >
                        {badgeLabel}
                    </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                    {isVulnerable
                        ? 'POST /api/checkout — no idempotency key. A retry after a 503 creates a duplicate order.'
                        : 'POST /api/checkout/protected — idempotency key prevents duplicate orders on retry.'}
                </p>
            </div>

            {/* Run button */}
            <button
                onClick={onRun}
                disabled={state.phase === 'running'}
                className={`self-start rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${buttonColour}`}
            >
                {state.phase === 'running' ? 'Running…' : label}
            </button>

            {/* Loading */}
            {state.phase === 'running' && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-gray-800" />
                    {state.step}
                </div>
            )}

            {/* Error */}
            {state.phase === 'error' && (
                <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <strong>Error:</strong> {state.message}
                </div>
            )}

            {/* Results */}
            {state.phase === 'done' && (
                <ScenarioResults kind={kind} data={state.data} />
            )}
        </div>
    );
}

// ── Scenario results ──────────────────────────────────────────────────────────

function ScenarioResults({
    kind,
    data,
}: {
    kind: ScenarioKind;
    data: RunData;
}) {
    const isVulnerable = kind === 'vulnerable';
    const uniqueOrderIds = [...new Set(data.attempts.map((a) => a.order_id))];
    const isDuplicate = uniqueOrderIds.length > 1;

    return (
        <div className="space-y-4">
            {/* Run meta */}
            <div className="rounded border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
                <span className="font-medium text-gray-700">Run ID: </span>
                <span className="font-mono">{data.run_id}</span>
            </div>

            {/* Outcome summary */}
            {isVulnerable ? (
                isDuplicate ? (
                    <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <strong>Duplicate detected:</strong>{' '}
                        {data.orders.length} orders were created for the same
                        operation — this is the bug idempotency keys fix.
                    </div>
                ) : (
                    <div className="rounded border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        Scenario complete. Check the orders below.
                    </div>
                )
            ) : !isDuplicate ? (
                <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <strong>No duplicate:</strong> Both attempts reference the
                    same order (#{uniqueOrderIds[0]}). Idempotency prevented a
                    double-charge.
                </div>
            ) : (
                <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Unexpected: {data.orders.length} orders found for the
                    protected scenario.
                </div>
            )}

            {/* Two-column evidence */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <CustomerView attempts={data.attempts} />
                <ServerView orders={data.orders} attempts={data.attempts} />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
                <StatBox
                    label="Orders created"
                    value={String(data.orders.length)}
                    highlight={data.orders.length > 1 ? 'bad' : 'good'}
                />
                <StatBox
                    label="Attempts"
                    value={String(data.attempts.length)}
                    highlight="neutral"
                />
                <StatBox
                    label="Duplicate"
                    value={isDuplicate ? 'YES' : 'NO'}
                    highlight={isDuplicate ? 'bad' : 'good'}
                />
            </div>
        </div>
    );
}

function StatBox({
    label,
    value,
    highlight,
}: {
    label: string;
    value: string;
    highlight: 'good' | 'bad' | 'neutral';
}) {
    const colour =
        highlight === 'good'
            ? 'bg-green-50 border-green-200 text-green-800'
            : highlight === 'bad'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-gray-50 border-gray-200 text-gray-700';
    return (
        <div className={`rounded border px-3 py-2 ${colour}`}>
            <div className="text-lg font-bold">{value}</div>
            <div className="text-xs opacity-75">{label}</div>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Demo() {
    const [vulnerableState, setVulnerableState] = useState<ScenarioState>({
        phase: 'idle',
    });
    const [protectedState, setProtectedState] = useState<ScenarioState>({
        phase: 'idle',
    });

    const handleRunVulnerable = useCallback(async () => {
        setVulnerableState({ phase: 'running', step: 'Starting…' });
        try {
            const data = await runVulnerableScenario((step) =>
                setVulnerableState({ phase: 'running', step }),
            );
            setVulnerableState({ phase: 'done', data });
        } catch (err) {
            setVulnerableState({
                phase: 'error',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }, []);

    const handleRunProtected = useCallback(async () => {
        setProtectedState({ phase: 'running', step: 'Starting…' });
        try {
            const data = await runProtectedScenario((step) =>
                setProtectedState({ phase: 'running', step }),
            );
            setProtectedState({ phase: 'done', data });
        } catch (err) {
            setProtectedState({
                phase: 'error',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }, []);

    return (
        <>
            <Head title="Replay Timeline Demo" />

            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto max-w-5xl">
                    {/* Header */}
                    <div className="mb-6">
                        <h1 className="text-xl font-semibold text-gray-900">
                            Recovery Replay — Before / After Comparison
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Run both scenarios to compare the vulnerable
                            checkout (duplicate orders) against the
                            idempotency-protected checkout (single order on
                            retry). All results come from live API calls and
                            real database records.
                        </p>
                    </div>

                    {/* Side-by-side panels */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <ScenarioPanel
                            kind="vulnerable"
                            state={vulnerableState}
                            onRun={handleRunVulnerable}
                        />
                        <ScenarioPanel
                            kind="protected"
                            state={protectedState}
                            onRun={handleRunProtected}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}
