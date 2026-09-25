import { AttemptFlow } from '@/components/replay/attempt-flow';
import { orderAttempts } from '@/components/replay/evidence';
import type {
    InvestigationStep,
    PanelState,
    ScenarioDomain,
    ScenarioKind,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

const ENDPOINTS: Record<
    ScenarioDomain,
    Record<ScenarioKind, { title: string; endpoint: string }>
> = {
    checkout: {
        vulnerable: {
            title: 'Vulnerable checkout',
            endpoint: 'POST /api/checkout',
        },
        protected: {
            title: 'Protected checkout',
            endpoint: 'POST /api/checkout/protected',
        },
    },
    reservation: {
        vulnerable: {
            title: 'Vulnerable reservation',
            endpoint: 'POST /api/reservations',
        },
        protected: {
            title: 'Protected reservation',
            endpoint: 'POST /api/reservations/protected',
        },
    },
};

export function ComparisonSidePanel({
    domain,
    kind,
    state,
    step,
    onRerun,
}: {
    domain: ScenarioDomain;
    kind: ScenarioKind;
    state: PanelState;
    step: InvestigationStep;
    onRerun: () => void;
}) {
    const copy = ENDPOINTS[domain][kind];
    const isVulnerable = kind === 'vulnerable';
    const attemptIndex = step === 'retry' ? 1 : 0;

    return (
        <section
            className={cn(
                'flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface-raised/90 p-4 shadow-[0_1px_0_rgba(15,23,32,0.04)] backdrop-blur-sm sm:p-5',
                isVulnerable
                    ? 'border-l-[3px] border-l-danger'
                    : 'border-l-[3px] border-l-safe',
            )}
            aria-busy={state.phase === 'running'}
            aria-label={isVulnerable ? 'Before comparison' : 'After comparison'}
        >
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={cn(
                                'rounded-md px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase',
                                isVulnerable
                                    ? 'bg-danger-soft text-danger'
                                    : 'bg-safe-soft text-safe',
                            )}
                        >
                            {isVulnerable ? 'Before' : 'After'}
                        </span>
                        <span className="text-xs text-ink-faint">
                            {isVulnerable
                                ? 'No idempotency'
                                : 'Idempotency protected'}
                        </span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold tracking-tight text-ink">
                        {copy.title}
                    </h2>
                    <p className="mt-1 font-mono text-xs break-all text-ink-muted">
                        {copy.endpoint}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onRerun}
                    disabled={state.phase === 'running'}
                    className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {state.phase === 'running' ? 'Running…' : 'Rerun this side'}
                </button>
            </header>

            {state.phase === 'running' && (
                <div
                    role="status"
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-muted"
                >
                    <span
                        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent"
                        aria-hidden="true"
                    />
                    <span className="replay-pulse-soft">{state.step}</span>
                </div>
            )}

            {state.phase === 'error' && (
                <div
                    role="alert"
                    className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm break-words text-danger"
                >
                    <p className="font-semibold">This run did not finish.</p>
                    <p className="mt-1 text-danger/90">{state.message}</p>
                    <p className="mt-2 text-xs text-danger/80">
                        A failed run is not treated as a successful comparison.
                    </p>
                </div>
            )}

            {state.phase === 'idle' && (
                <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-ink-muted">
                        Waiting for a comparison run
                    </p>
                    <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-faint">
                        Use Run comparison above, or rerun this side on its own.
                    </p>
                </div>
            )}

            {state.phase === 'done' && step !== 'verdict' && (
                <AttemptFlow
                    kind={kind}
                    attempts={orderAttempts(state.data.attempts)}
                    attemptIndex={attemptIndex}
                    clientResponses={state.clientResponses}
                />
            )}

            {state.phase === 'done' && step === 'verdict' && (
                <p className="rounded-xl border border-line bg-surface/60 px-3 py-3 text-xs leading-relaxed text-ink-muted">
                    Verdict is shown in the shared comparison below. Use the
                    stepper or Back to retry to return to attempt evidence.
                </p>
            )}
        </section>
    );
}
