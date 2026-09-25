import { AttemptFlow } from '@/components/replay/attempt-flow';
import { orderAttempts } from '@/components/replay/evidence';
import { HistoricalEvidenceInspector } from '@/components/replay/historical-evidence-inspector';
import { HistoricalVerdict } from '@/components/replay/historical-verdict';
import { SharedStepper } from '@/components/replay/shared-stepper';
import { StepContinue } from '@/components/replay/step-continue';
import type {
    InvestigationStep,
    RunData,
    RunSummary,
} from '@/components/replay/types';
import { CopyControl } from '@/components/replay/copy-control';
import { cn } from '@/lib/utils';

function SafetyBadge({ result }: { result: RunSummary['safety_result'] }) {
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

export function HistoricalRunWorkspace({
    summary,
    data,
    step,
    onStepChange,
    onBack,
}: {
    summary: RunSummary;
    data: RunData;
    step: InvestigationStep;
    onStepChange: (step: InvestigationStep) => void;
    onBack: () => void;
}) {
    const state = {
        phase: 'done' as const,
        data,
        clientResponses: [],
    };
    const attempts = orderAttempts(data.attempts);
    const attemptIndex = step === 'retry' ? 1 : 0;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-faint">
                        Historical run
                    </p>
                    <div className="mt-1">
                        <CopyControl label="run_id" value={summary.run_id} />
                    </div>
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <div>
                            <dt className="inline text-ink-faint">Type </dt>
                            <dd className="inline font-mono">
                                {summary.resource_type ?? 'unavailable'}
                            </dd>
                        </div>
                        <div>
                            <dt className="inline text-ink-faint">Attempts </dt>
                            <dd className="inline font-mono">
                                {summary.attempt_count}
                            </dd>
                        </div>
                        <div>
                            <dt className="inline text-ink-faint">
                                Resources{' '}
                            </dt>
                            <dd className="inline font-mono">
                                {summary.resource_count}
                            </dd>
                        </div>
                        <div>
                            <dt className="inline text-ink-faint">Recorded </dt>
                            <dd className="inline font-mono">
                                {summary.recorded_at ?? 'unavailable'}
                            </dd>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <dt className="text-ink-faint">Safety</dt>
                            <dd>
                                <SafetyBadge result={summary.safety_result} />
                            </dd>
                        </div>
                    </dl>
                </div>
                <button
                    type="button"
                    onClick={onBack}
                    className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                    Back to list
                </button>
            </div>

            <p className="text-xs text-ink-faint">
                Read-only. Opening this run does not execute a scenario or
                create records. HTTP response bodies and scenario mode are
                unavailable because they were not persisted.
            </p>

            <SharedStepper
                step={step}
                onChange={onStepChange}
                enabled
                idleHint="Step through recorded initial attempt, retry, and verdict."
            />

            <div
                id="investigation-workspace"
                role="tabpanel"
                aria-labelledby={`investigation-step-${step}`}
                className="flex min-w-0 flex-col gap-6"
            >
                {step === 'verdict' ? (
                    <HistoricalVerdict summary={summary} state={state} />
                ) : (
                    <section className="rounded-2xl border border-l-[3px] border-line border-l-accent bg-surface-raised/90 p-4 shadow-[0_1px_0_rgba(15,23,32,0.04)] sm:p-5">
                        <header className="mb-4">
                            <h2 className="text-base font-semibold tracking-tight text-ink">
                                {step === 'initial'
                                    ? 'Initial attempt'
                                    : 'Retry'}
                            </h2>
                            <p className="mt-1 text-xs text-ink-muted">
                                From persisted replay evidence for this run
                                only.
                            </p>
                        </header>
                        <AttemptFlow
                            kind="historical"
                            attempts={attempts}
                            attemptIndex={attemptIndex}
                            clientResponses={[]}
                        />
                    </section>
                )}

                <HistoricalEvidenceInspector step={step} state={state} />

                <StepContinue step={step} enabled onChange={onStepChange} />
            </div>
        </div>
    );
}
