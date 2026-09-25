import { ReplayExplorer } from '@/components/replay/replay-explorer';
import type {
    PanelState,
    ScenarioDomain,
    ScenarioKind,
} from '@/components/replay/types';

const COPY: Record<
    ScenarioDomain,
    Record<
        ScenarioKind,
        { title: string; endpoint: string; detail: string; action: string }
    >
> = {
    checkout: {
        vulnerable: {
            title: 'Vulnerable checkout',
            endpoint: 'POST /api/checkout',
            detail: 'No idempotency key. The first request injects a fault and the second retries the same operation.',
            action: 'Run vulnerable checkout',
        },
        protected: {
            title: 'Protected checkout',
            endpoint: 'POST /api/checkout/protected',
            detail: 'Sends an idempotency key. The first request injects a fault and the second retries with the same key.',
            action: 'Run protected checkout',
        },
    },
    reservation: {
        vulnerable: {
            title: 'Vulnerable reservation',
            endpoint: 'POST /api/reservations',
            detail: 'No idempotency key. The first request injects a fault and the second retries the same operation.',
            action: 'Run vulnerable reservation',
        },
        protected: {
            title: 'Protected reservation',
            endpoint: 'POST /api/reservations/protected',
            detail: 'Sends an idempotency key. The first request injects a fault and the second retries with the same key.',
            action: 'Run protected reservation',
        },
    },
};

export function ScenarioPanel({
    domain,
    kind,
    state,
    onRun,
}: {
    domain: ScenarioDomain;
    kind: ScenarioKind;
    state: PanelState;
    onRun: () => void;
}) {
    const copy = COPY[domain][kind];
    const isVulnerable = kind === 'vulnerable';
    const headerBg = isVulnerable
        ? 'border-red-200 bg-red-50'
        : 'border-green-200 bg-green-50';
    const headerText = isVulnerable ? 'text-red-800' : 'text-green-800';
    const badgeColour = isVulnerable
        ? 'bg-red-100 text-red-700'
        : 'bg-green-100 text-green-700';
    const buttonColour = isVulnerable
        ? 'bg-red-700 hover:bg-red-600'
        : 'bg-green-700 hover:bg-green-600';

    return (
        <section
            className="flex min-w-0 flex-col gap-4"
            aria-busy={state.phase === 'running'}
        >
            <div className={`rounded border px-4 py-3 ${headerBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                        className={`text-xs font-semibold tracking-wide uppercase ${headerText}`}
                    >
                        {isVulnerable ? '❌ ' : '✅ '}
                        {copy.title}
                    </h2>
                    <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeColour}`}
                    >
                        {isVulnerable
                            ? 'BEFORE — No idempotency'
                            : 'AFTER — Idempotency protected'}
                    </span>
                </div>
                <p className="mt-1 font-mono text-xs text-gray-700">
                    {copy.endpoint}
                </p>
                <p className="mt-1 text-xs text-gray-600">{copy.detail}</p>
            </div>

            <button
                type="button"
                onClick={onRun}
                disabled={state.phase === 'running'}
                className={`self-start rounded px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${buttonColour}`}
            >
                {state.phase === 'running' ? 'Running…' : copy.action}
            </button>

            {state.phase === 'running' && (
                <div
                    role="status"
                    className="flex items-center gap-2 text-sm text-gray-600"
                >
                    <span
                        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-gray-800"
                        aria-hidden="true"
                    />
                    {state.step}
                </div>
            )}

            {state.phase === 'error' && (
                <div
                    role="alert"
                    className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm break-words text-red-700"
                >
                    <p className="font-semibold">This run did not finish.</p>
                    <p className="mt-1">{state.message}</p>
                </div>
            )}

            {state.phase === 'idle' && (
                <div className="rounded border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500">
                    <p>No replay evidence yet.</p>
                    <p className="mt-1">
                        Run this scenario to record the initial attempt and the
                        retry. Previous, Next, and Show all step through that
                        evidence.
                    </p>
                </div>
            )}

            {state.phase === 'done' && (
                <ReplayExplorer
                    key={state.data.run_id}
                    domain={domain}
                    data={state.data}
                    clientResponses={state.clientResponses}
                />
            )}
        </section>
    );
}
