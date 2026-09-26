import { HistoricalEvidenceInspector } from '@/components/replay/historical-evidence-inspector';
import { HistoricalVerdict } from '@/components/replay/historical-verdict';
import { SharedStepper } from '@/components/replay/shared-stepper';
import { StepContinue } from '@/components/replay/step-continue';
import { AttemptFlow } from '@/components/replay/attempt-flow';
import { orderAttempts } from '@/components/replay/evidence';
import { CopyControl } from '@/components/replay/copy-control';
import type { ComparisonDetail } from '@/components/replay/comparison-client';
import type {
    InvestigationStep,
    PanelState,
    RunData,
    RunSummary,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

function ComparisonSide({
    label,
    isVulnerable,
    summary,
    data,
    step,
}: {
    label: string;
    isVulnerable: boolean;
    summary: RunSummary;
    data: RunData;
    step: InvestigationStep;
}) {
    const state: Extract<PanelState, { phase: 'done' }> = {
        phase: 'done',
        data,
        clientResponses: [],
    };
    const attempts = orderAttempts(data.attempts);
    const attemptIndex = step === 'retry' ? 1 : 0;

    return (
        <section
            className={cn(
                'flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface-raised/90 p-4 shadow-[0_1px_0_rgba(15,23,32,0.04)] sm:p-5',
                isVulnerable
                    ? 'border-l-[3px] border-l-danger'
                    : 'border-l-[3px] border-l-safe',
            )}
            aria-label={isVulnerable ? 'Before comparison' : 'After comparison'}
        >
            <header className="flex flex-col gap-2">
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
                <h2 className="text-sm font-semibold text-ink">{label}</h2>
                <CopyControl label="run_id" value={summary.run_id} />
            </header>

            {step !== 'verdict' && (
                <AttemptFlow
                    kind="historical"
                    attempts={attempts}
                    attemptIndex={attemptIndex}
                    clientResponses={[]}
                />
            )}

            {step === 'verdict' && (
                <p className="rounded-xl border border-line bg-surface/60 px-3 py-3 text-xs leading-relaxed text-ink-muted">
                    Verdict is shown below. Use the stepper to return to attempt
                    evidence.
                </p>
            )}

            <HistoricalEvidenceInspector step={step} state={state} />
        </section>
    );
}

export function HistoricalComparisonWorkspace({
    comparison,
    step,
    onStepChange,
    onBack,
}: {
    comparison: ComparisonDetail;
    step: InvestigationStep;
    onStepChange: (step: InvestigationStep) => void;
    onBack: () => void;
}) {
    const beforeState: Extract<PanelState, { phase: 'done' }> = {
        phase: 'done',
        data: comparison.before.data,
        clientResponses: [],
    };
    const afterState: Extract<PanelState, { phase: 'done' }> = {
        phase: 'done',
        data: comparison.after.data,
        clientResponses: [],
    };

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

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-faint">
                        Saved comparison
                    </p>
                    <div className="mt-1">
                        <CopyControl
                            label="comparison_id"
                            value={comparison.comparison_id}
                        />
                    </div>
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <div>
                            <dt className="inline text-ink-faint">Type </dt>
                            <dd className="inline font-mono">
                                {comparison.resource_type}
                            </dd>
                        </div>
                        <div>
                            <dt className="inline text-ink-faint">Saved </dt>
                            <dd className="inline font-mono">
                                {formatTimestamp(comparison.created_at)}
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-2 flex flex-col gap-1">
                        <CopyControl
                            label="before_run_id"
                            value={comparison.before_run_id}
                        />
                        <CopyControl
                            label="after_run_id"
                            value={comparison.after_run_id}
                        />
                    </div>
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
                Read-only. Opening this comparison does not execute a scenario
                or create records. HTTP response bodies are unavailable because
                they were not persisted.
            </p>

            <SharedStepper
                step={step}
                onChange={onStepChange}
                enabled
                idleHint="Step through initial attempt, retry, and verdict."
            />

            <div
                id="investigation-workspace"
                role="tabpanel"
                aria-labelledby={`investigation-step-${step}`}
                className="flex min-w-0 flex-col gap-6"
            >
                {step === 'verdict' ? (
                    <section className="flex flex-col gap-4">
                        <div>
                            <h2 className="text-sm font-semibold text-ink">
                                Verdict
                            </h2>
                            <p className="mt-1 text-xs text-ink-muted">
                                Derived from each run’s persisted evidence only.
                                Before/After pairing is stored on this
                                comparison; scenario mode was not recorded.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <HistoricalVerdict
                                summary={comparison.before.summary}
                                state={beforeState}
                                context="comparison"
                            />
                            <HistoricalVerdict
                                summary={comparison.after.summary}
                                state={afterState}
                                context="comparison"
                            />
                        </div>
                    </section>
                ) : (
                    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
                        <ComparisonSide
                            label="Vulnerable run (Before)"
                            isVulnerable
                            summary={comparison.before.summary}
                            data={comparison.before.data}
                            step={step}
                        />
                        <ComparisonSide
                            label="Protected run (After)"
                            isVulnerable={false}
                            summary={comparison.after.summary}
                            data={comparison.after.data}
                            step={step}
                        />
                    </div>
                )}

                <StepContinue step={step} enabled onChange={onStepChange} />
            </div>
        </div>
    );
}
