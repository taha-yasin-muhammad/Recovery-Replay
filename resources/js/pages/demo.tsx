import { Head, Link } from '@inertiajs/react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react';
import { saveComparison } from '@/components/replay/comparison-client';
import { ComparisonSidePanel } from '@/components/replay/comparison-side-panel';
import { EvidenceInspector } from '@/components/replay/evidence-inspector';
import { runScenario } from '@/components/replay/replay-client';
import { SharedStepper } from '@/components/replay/shared-stepper';
import { StepContinue } from '@/components/replay/step-continue';
import { VerdictStep } from '@/components/replay/verdict-step';
import type {
    InvestigationStep,
    PanelState,
    ScenarioDomain,
    ScenarioKind,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

type DomainRuns = Record<ScenarioKind, PanelState>;

function idleRuns(): Record<ScenarioDomain, DomainRuns> {
    return {
        checkout: {
            vulnerable: { phase: 'idle' },
            protected: { phase: 'idle' },
        },
        reservation: {
            vulnerable: { phase: 'idle' },
            protected: { phase: 'idle' },
        },
    };
}

const DOMAINS: ScenarioDomain[] = ['checkout', 'reservation'];

const DOMAIN_LABELS: Record<ScenarioDomain, string> = {
    checkout: 'Checkout',
    reservation: 'Reservation',
};

function bothDone(active: DomainRuns): boolean {
    return (
        active.vulnerable.phase === 'done' && active.protected.phase === 'done'
    );
}

function anyRunning(active: DomainRuns): boolean {
    return (
        active.vulnerable.phase === 'running' ||
        active.protected.phase === 'running'
    );
}

type SaveState =
    | { phase: 'idle' }
    | { phase: 'saving' }
    | { phase: 'saved'; comparisonId: string }
    | { phase: 'error'; message: string };

export default function Demo() {
    const [domain, setDomain] = useState<ScenarioDomain>('checkout');
    const [runs, setRuns] = useState(idleRuns);
    const [step, setStep] = useState<InvestigationStep>('initial');
    const [inspectorSide, setInspectorSide] =
        useState<ScenarioKind>('vulnerable');
    const [saveState, setSaveState] = useState<SaveState>({ phase: 'idle' });
    const checkoutTabRef = useRef<HTMLButtonElement>(null);
    const reservationTabRef = useRef<HTMLButtonElement>(null);
    const active = runs[domain];
    const comparisonReady = bothDone(active);
    const comparisonRunning = anyRunning(active);

    useEffect(() => {
        if (!comparisonReady && step === 'verdict') {
            setStep('initial');
        }
    }, [comparisonReady, step]);

    const handleRun = useCallback(
        async (scenarioDomain: ScenarioDomain, kind: ScenarioKind) => {
            setRuns((current) => ({
                ...current,
                [scenarioDomain]: {
                    ...current[scenarioDomain],
                    [kind]: { phase: 'running', step: 'Starting…' },
                },
            }));

            try {
                const result = await runScenario(
                    scenarioDomain,
                    kind,
                    (progress) => {
                        setRuns((current) => ({
                            ...current,
                            [scenarioDomain]: {
                                ...current[scenarioDomain],
                                [kind]: { phase: 'running', step: progress },
                            },
                        }));
                    },
                );

                setRuns((current) => ({
                    ...current,
                    [scenarioDomain]: {
                        ...current[scenarioDomain],
                        [kind]: {
                            phase: 'done',
                            data: result.data,
                            clientResponses: result.clientResponses,
                        },
                    },
                }));

                return true;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);

                setRuns((current) => ({
                    ...current,
                    [scenarioDomain]: {
                        ...current[scenarioDomain],
                        [kind]: { phase: 'error', message },
                    },
                }));

                return false;
            }
        },
        [],
    );

    const runComparison = useCallback(async () => {
        setStep('initial');
        const [vulnerableOk, protectedOk] = await Promise.all([
            handleRun(domain, 'vulnerable'),
            handleRun(domain, 'protected'),
        ]);

        if (vulnerableOk && protectedOk) {
            setStep('initial');
        }
    }, [domain, handleRun]);

    const rerunSide = useCallback(
        async (kind: ScenarioKind) => {
            const ok = await handleRun(domain, kind);

            if (ok) {
                setStep('initial');
            }
        },
        [domain, handleRun],
    );

    const handleSaveComparison = useCallback(async () => {
        const vuln = active.vulnerable;
        const prot = active.protected;

        if (vuln.phase !== 'done' || prot.phase !== 'done') {
            return;
        }

        setSaveState({ phase: 'saving' });

        try {
            const result = await saveComparison(
                vuln.data.run_id,
                prot.data.run_id,
            );

            if (result.saved && result.comparison_id !== null) {
                setSaveState({
                    phase: 'saved',
                    comparisonId: result.comparison_id,
                });
            } else {
                setSaveState({
                    phase: 'error',
                    message:
                        result.error ??
                        'Comparison could not be saved. Verify both runs have complete evidence.',
                });
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setSaveState({ phase: 'error', message });
        }
    }, [active]);

    function selectDomain(next: ScenarioDomain) {
        setDomain(next);
        setStep('initial');
        setInspectorSide('vulnerable');
        setSaveState({ phase: 'idle' });
        const tab =
            next === 'checkout'
                ? checkoutTabRef.current
                : reservationTabRef.current;
        tab?.focus();
    }

    function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        const index = DOMAINS.indexOf(domain);
        let next = domain;

        if (event.key === 'ArrowRight') {
            next = DOMAINS[(index + 1) % DOMAINS.length] ?? domain;
        } else if (event.key === 'ArrowLeft') {
            next =
                DOMAINS[(index - 1 + DOMAINS.length) % DOMAINS.length] ??
                domain;
        } else if (event.key === 'Home') {
            next = 'checkout';
        } else if (event.key === 'End') {
            next = 'reservation';
        } else {
            return;
        }

        event.preventDefault();
        selectDomain(next);
    }

    const vulnerableDone =
        active.vulnerable.phase === 'done' ? active.vulnerable : null;
    const protectedDone =
        active.protected.phase === 'done' ? active.protected : null;
    const failedComparison =
        active.vulnerable.phase === 'error' ||
        active.protected.phase === 'error';

    // Reset save state when either side gets rerun.
    useEffect(() => {
        if (saveState.phase !== 'idle') {
            setSaveState({ phase: 'idle' });
        }
        // Intentionally only watching `active` identity changes (domain switches / reruns).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active.vulnerable, active.protected]);

    return (
        <>
            <Head title="Investigation Workspace" />

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
                    <header className="replay-fade-up mb-6 flex flex-col gap-6 border-b border-line pb-6 sm:mb-8 sm:pb-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                            <div className="max-w-2xl min-w-0">
                                <p className="font-mono text-[0.7rem] tracking-[0.18em] text-accent uppercase">
                                    Recovery Replay
                                </p>
                                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                                    Investigation Workspace
                                </h1>
                                <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-[0.95rem]">
                                    One shared timeline for Before and After.
                                    Compare the failed client response with what
                                    actually persisted, then inspect the retry
                                    outcome.
                                </p>
                            </div>

                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                                <Link
                                    href="/demo/history"
                                    className="order-last text-center text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline sm:order-first sm:mb-2.5 sm:text-left"
                                >
                                    Run History
                                </Link>
                                <div>
                                    <p
                                        id="scenario-label"
                                        className="mb-2 text-xs font-medium text-ink-faint"
                                    >
                                        Scenario
                                    </p>
                                    <div
                                        role="tablist"
                                        aria-labelledby="scenario-label"
                                        className="inline-flex rounded-xl border border-line bg-surface-raised/80 p-1 shadow-[0_1px_0_rgba(15,23,32,0.04)] backdrop-blur-sm"
                                        onKeyDown={onTabKeyDown}
                                    >
                                        <button
                                            ref={checkoutTabRef}
                                            id="scenario-tab-checkout"
                                            type="button"
                                            role="tab"
                                            aria-selected={
                                                domain === 'checkout'
                                            }
                                            aria-controls="investigation-workspace"
                                            tabIndex={
                                                domain === 'checkout' ? 0 : -1
                                            }
                                            onClick={() =>
                                                selectDomain('checkout')
                                            }
                                            className={cn(
                                                'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                                domain === 'checkout'
                                                    ? 'bg-ink text-white'
                                                    : 'text-ink-muted hover:bg-surface hover:text-ink',
                                            )}
                                        >
                                            {DOMAIN_LABELS.checkout}
                                        </button>
                                        <button
                                            ref={reservationTabRef}
                                            id="scenario-tab-reservation"
                                            type="button"
                                            role="tab"
                                            aria-selected={
                                                domain === 'reservation'
                                            }
                                            aria-controls="investigation-workspace"
                                            tabIndex={
                                                domain === 'reservation'
                                                    ? 0
                                                    : -1
                                            }
                                            onClick={() =>
                                                selectDomain('reservation')
                                            }
                                            className={cn(
                                                'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                                domain === 'reservation'
                                                    ? 'bg-ink text-white'
                                                    : 'text-ink-muted hover:bg-surface hover:text-ink',
                                            )}
                                        >
                                            {DOMAIN_LABELS.reservation}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        void runComparison();
                                    }}
                                    disabled={comparisonRunning}
                                    className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {comparisonRunning
                                        ? 'Running comparison…'
                                        : 'Run comparison'}
                                </button>
                            </div>
                        </div>

                        <p className="text-xs text-ink-faint">
                            Each side uses a separate run id and isolated
                            evidence. Rerun either side independently from its
                            panel.
                        </p>

                        {/* Save comparison — shown only when both sides are done */}
                        {comparisonReady && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleSaveComparison();
                                    }}
                                    disabled={
                                        saveState.phase === 'saving' ||
                                        saveState.phase === 'saved'
                                    }
                                    className="inline-flex items-center justify-center rounded-xl border border-safe/40 bg-safe-soft px-4 py-2 text-sm font-semibold text-safe transition-colors hover:bg-safe/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {saveState.phase === 'saving'
                                        ? 'Saving…'
                                        : saveState.phase === 'saved'
                                          ? 'Saved ✓'
                                          : 'Save comparison'}
                                </button>

                                {saveState.phase === 'saved' && (
                                    <p className="font-mono text-xs text-ink-muted">
                                        comparison_id:{' '}
                                        <span className="font-mono text-xs text-ink">
                                            {saveState.comparisonId}
                                        </span>
                                    </p>
                                )}

                                {saveState.phase === 'error' && (
                                    <p
                                        role="alert"
                                        className="text-xs text-danger"
                                    >
                                        {saveState.message}
                                    </p>
                                )}
                            </div>
                        )}
                    </header>

                    <div className="replay-fade-up-delay flex flex-col gap-6">
                        <SharedStepper
                            step={step}
                            onChange={setStep}
                            enabled={comparisonReady}
                        />

                        {failedComparison && !comparisonReady && (
                            <div
                                role="alert"
                                className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
                            >
                                Comparison incomplete — at least one side
                                failed. Fix or rerun the failed side before
                                treating this as a successful Before/After
                                comparison.
                            </div>
                        )}

                        <div
                            id="investigation-workspace"
                            role="tabpanel"
                            aria-labelledby={`investigation-step-${step}`}
                            className="flex min-w-0 flex-col gap-6"
                        >
                            {step === 'verdict' &&
                            vulnerableDone &&
                            protectedDone ? (
                                <VerdictStep
                                    domain={domain}
                                    vulnerable={vulnerableDone}
                                    protectedState={protectedDone}
                                />
                            ) : (
                                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
                                    <ComparisonSidePanel
                                        domain={domain}
                                        kind="vulnerable"
                                        state={active.vulnerable}
                                        step={step}
                                        onRerun={() => {
                                            void rerunSide('vulnerable');
                                        }}
                                    />
                                    <ComparisonSidePanel
                                        domain={domain}
                                        kind="protected"
                                        state={active.protected}
                                        step={step}
                                        onRerun={() => {
                                            void rerunSide('protected');
                                        }}
                                    />
                                </div>
                            )}

                            <EvidenceInspector
                                step={step}
                                side={inspectorSide}
                                onSideChange={setInspectorSide}
                                vulnerable={active.vulnerable}
                                protectedState={active.protected}
                            />

                            <StepContinue
                                step={step}
                                enabled={comparisonReady}
                                onChange={setStep}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
