import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CopyControl } from '@/components/replay/copy-control';
import {
    findPersistedResource,
    orderAttempts,
    persistedFieldEntries,
} from '@/components/replay/evidence';
import { StatusBadge } from '@/components/replay/status-badge';
import type {
    InspectorAttempt,
    InspectorEvidenceTab,
    InvestigationStep,
    PanelState,
    PersistedResource,
    ReplayAttempt,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

const EVIDENCE_TABS: { id: InspectorEvidenceTab; label: string }[] = [
    { id: 'http', label: 'HTTP Response' },
    { id: 'replay', label: 'Replay Evidence' },
    { id: 'persisted', label: 'Persisted Resource' },
    { id: 'raw', label: 'Raw JSON' },
];

function formatBody(body: unknown): string {
    if (body === null || body === undefined || body === '') {
        return 'Empty response body';
    }

    if (typeof body === 'string') {
        return body;
    }

    try {
        return JSON.stringify(body, null, 2);
    } catch {
        return 'Response body could not be displayed.';
    }
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-1 gap-0.5 border-t border-line/70 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
            <dt className="font-mono text-xs text-ink-faint">{label}</dt>
            <dd className="min-w-0 font-mono text-xs break-all text-ink">
                {value}
            </dd>
        </div>
    );
}

function Unavailable({ message }: { message: string }) {
    return (
        <p
            role="status"
            className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-3 py-4 text-sm text-ink-faint"
        >
            {message}
        </p>
    );
}

function SegmentedTabs<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { id: T; label: string }[];
    onChange: (value: T) => void;
}) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const activeIndex = options.findIndex((option) => option.id === value);

    function select(index: number) {
        const next = options[index];

        if (!next) {
            return;
        }

        onChange(next.id);
        refs.current[index]?.focus();
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        let next = activeIndex;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            next = (activeIndex + 1) % options.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            next = (activeIndex - 1 + options.length) % options.length;
        } else if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = options.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        select(next);
    }

    return (
        <div>
            <p className="mb-1.5 text-xs font-medium text-ink-faint">{label}</p>
            <div
                role="tablist"
                aria-label={label}
                className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1"
                onKeyDown={onKeyDown}
            >
                {options.map((option, index) => {
                    const selected = option.id === value;

                    return (
                        <button
                            key={option.id}
                            ref={(node) => {
                                refs.current[index] = node;
                            }}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => select(index)}
                            className={cn(
                                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                selected
                                    ? 'bg-ink text-white'
                                    : 'text-ink-muted hover:text-ink',
                            )}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function stepToInspectorAttempt(step: InvestigationStep): InspectorAttempt {
    return step === 'retry' ? 'retry' : 'initial';
}

/**
 * Single-run evidence inspector for history. Does not invent HTTP bodies —
 * historical client responses were never persisted.
 */
export function HistoricalEvidenceInspector({
    step,
    state,
}: {
    step: InvestigationStep;
    state: PanelState;
}) {
    const panelId = useId();
    const tabPanelId = useId();
    const [open, setOpen] = useState(false);
    const [inspectorAttempt, setInspectorAttempt] = useState<InspectorAttempt>(
        () => stepToInspectorAttempt(step),
    );
    const [evidenceTab, setEvidenceTab] =
        useState<InspectorEvidenceTab>('replay');
    const attemptIndex = inspectorAttempt === 'retry' ? 1 : 0;
    const ready = state.phase === 'done';

    useEffect(() => {
        if (step === 'initial' || step === 'retry') {
            setInspectorAttempt(stepToInspectorAttempt(step));
        }
    }, [step]);

    useEffect(() => {
        if (step === 'verdict') {
            setOpen(false);
        }
    }, [step]);

    let attempt: ReplayAttempt | null = null;
    let persisted: { kind: string; resource: PersistedResource } | null = null;

    if (ready) {
        const ordered = orderAttempts(state.data.attempts);
        attempt = ordered[attemptIndex] ?? null;

        if (attempt) {
            persisted = findPersistedResource(attempt, state.data);
        }
    }

    const contextLabel =
        inspectorAttempt === 'initial' ? 'Initial attempt' : 'Retry';

    return (
        <section className="rounded-2xl border border-line bg-surface-raised/90 shadow-[0_1px_0_rgba(15,23,32,0.04)]">
            <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-5"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((current) => !current)}
            >
                <span>
                    <span className="block text-sm font-semibold text-ink">
                        Evidence inspector
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-faint">
                        {open
                            ? `Inspecting ${contextLabel}`
                            : 'Collapsed by default — expand for technical evidence.'}
                    </span>
                </span>
                <span
                    className={cn(
                        'shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[0.65rem] text-ink-muted',
                        open && 'bg-ink text-white',
                    )}
                >
                    {open ? 'Hide' : 'Show'}
                </span>
            </button>

            {open && (
                <div
                    id={panelId}
                    className="border-t border-line px-4 py-4 sm:px-5"
                >
                    <div className="mb-4 rounded-xl border border-line bg-surface/60 px-3 py-2">
                        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-ink-faint uppercase">
                            Inspecting
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-ink">
                            Historical run · {contextLabel}
                        </p>
                    </div>

                    <div className="mb-4">
                        <SegmentedTabs
                            label="Attempt"
                            value={inspectorAttempt}
                            options={[
                                {
                                    id: 'initial' as const,
                                    label: 'Initial attempt',
                                },
                                { id: 'retry' as const, label: 'Retry' },
                            ]}
                            onChange={setInspectorAttempt}
                        />
                    </div>

                    {!ready && (
                        <Unavailable message="Evidence is unavailable until a historical run is loaded." />
                    )}

                    {ready && attempt === null && (
                        <Unavailable message="No replay attempt was recorded for the selected attempt." />
                    )}

                    {ready && attempt !== null && (
                        <div className="flex flex-col gap-3">
                            <div
                                role="tablist"
                                aria-label="Evidence sections"
                                className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4"
                            >
                                {EVIDENCE_TABS.map((tab) => {
                                    const selected = evidenceTab === tab.id;

                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            id={`${tabPanelId}-${tab.id}`}
                                            aria-selected={selected}
                                            aria-controls={`${tabPanelId}-panel`}
                                            tabIndex={selected ? 0 : -1}
                                            onClick={() =>
                                                setEvidenceTab(tab.id)
                                            }
                                            className={cn(
                                                'rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                                selected
                                                    ? 'border-ink bg-ink text-white'
                                                    : 'border-line bg-surface text-ink-muted hover:text-ink',
                                            )}
                                        >
                                            {tab.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div
                                id={`${tabPanelId}-panel`}
                                role="tabpanel"
                                aria-labelledby={`${tabPanelId}-${evidenceTab}`}
                                className="min-w-0"
                            >
                                {evidenceTab === 'http' && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge
                                                status={attempt.http_status}
                                            />
                                            <span className="text-sm font-medium text-ink">
                                                HTTP {attempt.http_status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-ink-muted">
                                            Persisted attempt status from replay
                                            evidence. This is not proof of
                                            actual client receipt.
                                        </p>
                                        <Unavailable message="HTTP response body was not persisted with historical evidence." />
                                    </div>
                                )}
                                {evidenceTab === 'replay' && (
                                    <dl>
                                        <div className="border-t border-line/70 py-2">
                                            <CopyControl
                                                label="run_id"
                                                value={attempt.run_id}
                                            />
                                        </div>
                                        <div className="border-t border-line/70 py-2">
                                            <CopyControl
                                                label="attempt_id"
                                                value={attempt.attempt_id}
                                            />
                                        </div>
                                        <EvidenceRow
                                            label="operation_id"
                                            value={attempt.operation_id}
                                        />
                                        <EvidenceRow
                                            label="http_status"
                                            value={String(attempt.http_status)}
                                        />
                                        <EvidenceRow
                                            label="resource_type"
                                            value={
                                                attempt.resource_type ?? 'null'
                                            }
                                        />
                                        <EvidenceRow
                                            label="resource_id"
                                            value={
                                                attempt.resource_id === null
                                                    ? 'null'
                                                    : String(
                                                          attempt.resource_id,
                                                      )
                                            }
                                        />
                                        <EvidenceRow
                                            label="order_count_after"
                                            value={String(
                                                attempt.order_count_after,
                                            )}
                                        />
                                        <EvidenceRow
                                            label="attempted_at"
                                            value={attempt.attempted_at}
                                        />
                                    </dl>
                                )}
                                {evidenceTab === 'persisted' &&
                                    (persisted ? (
                                        <dl>
                                            {persistedFieldEntries(
                                                persisted.resource,
                                            ).map((field) => (
                                                <EvidenceRow
                                                    key={field.key}
                                                    label={field.key}
                                                    value={field.value}
                                                />
                                            ))}
                                        </dl>
                                    ) : (
                                        <Unavailable
                                            message={`Persisted ${attempt.resource_type ?? 'resource'} is unavailable for this attempt.`}
                                        />
                                    ))}
                                {evidenceTab === 'raw' && (
                                    <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-ink-muted">
                                        {formatBody({
                                            client_response: null,
                                            replay_attempt: attempt,
                                            persisted_resource:
                                                persisted?.resource ?? null,
                                            note: 'HTTP response bodies and scenario mode were not persisted.',
                                        })}
                                    </pre>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
