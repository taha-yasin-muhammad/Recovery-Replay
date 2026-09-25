import { Head } from '@inertiajs/react';
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { ComparisonSummary } from '@/components/replay/comparison-summary';
import { runScenario } from '@/components/replay/replay-client';
import { ScenarioPanel } from '@/components/replay/scenario-panel';
import type {
    PanelState,
    ScenarioDomain,
    ScenarioKind,
} from '@/components/replay/types';

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

export default function Demo() {
    const [domain, setDomain] = useState<ScenarioDomain>('checkout');
    const [runs, setRuns] = useState(idleRuns);
    const checkoutTabRef = useRef<HTMLButtonElement>(null);
    const reservationTabRef = useRef<HTMLButtonElement>(null);
    const active = runs[domain];

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
                    (step) => {
                        setRuns((current) => ({
                            ...current,
                            [scenarioDomain]: {
                                ...current[scenarioDomain],
                                [kind]: { phase: 'running', step },
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
            }
        },
        [],
    );

    function selectDomain(next: ScenarioDomain) {
        setDomain(next);
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

    return (
        <>
            <Head title="Replay Explorer" />

            <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-6">
                        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                            Before / after comparison
                        </p>
                        <h1 className="mt-1 text-xl font-semibold text-gray-900">
                            Recovery Replay Explorer
                        </h1>
                        <p className="mt-1 max-w-3xl text-sm text-gray-500">
                            Compare a vulnerable retry with an idempotent retry
                            for checkout or reservation. Statuses, resource ids,
                            and counts come from the live responses and the
                            recorded replay attempts.
                        </p>
                    </div>

                    <div
                        role="tablist"
                        aria-label="Replay scenario"
                        className="mb-4 inline-flex max-w-full flex-wrap rounded border border-gray-200 bg-white p-1"
                        onKeyDown={onTabKeyDown}
                    >
                        <button
                            ref={checkoutTabRef}
                            id="scenario-tab-checkout"
                            type="button"
                            role="tab"
                            aria-selected={domain === 'checkout'}
                            aria-controls="scenario-panel"
                            tabIndex={domain === 'checkout' ? 0 : -1}
                            onClick={() => setDomain('checkout')}
                            className={`rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${domain === 'checkout' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            Checkout
                        </button>
                        <button
                            ref={reservationTabRef}
                            id="scenario-tab-reservation"
                            type="button"
                            role="tab"
                            aria-selected={domain === 'reservation'}
                            aria-controls="scenario-panel"
                            tabIndex={domain === 'reservation' ? 0 : -1}
                            onClick={() => setDomain('reservation')}
                            className={`rounded px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${domain === 'reservation' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            Reservation
                        </button>
                    </div>
                    <p className="mb-4 text-xs text-gray-500">
                        Checkout and reservation runs stay separate, including
                        their run ids.
                    </p>

                    <div
                        id="scenario-panel"
                        role="tabpanel"
                        aria-labelledby={
                            domain === 'checkout'
                                ? 'scenario-tab-checkout'
                                : 'scenario-tab-reservation'
                        }
                        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
                    >
                        <ScenarioPanel
                            domain={domain}
                            kind="vulnerable"
                            state={active.vulnerable}
                            onRun={() => {
                                void handleRun(domain, 'vulnerable');
                            }}
                        />
                        <ScenarioPanel
                            domain={domain}
                            kind="protected"
                            state={active.protected}
                            onRun={() => {
                                void handleRun(domain, 'protected');
                            }}
                        />
                    </div>

                    <ComparisonSummary
                        domain={domain}
                        vulnerable={active.vulnerable}
                        protectedState={active.protected}
                    />
                </div>
            </div>
        </>
    );
}
