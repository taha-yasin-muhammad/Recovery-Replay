import { useRef, type KeyboardEvent } from 'react';
import type { InvestigationStep } from '@/components/replay/types';
import { cn } from '@/lib/utils';

const STEPS: { id: InvestigationStep; label: string }[] = [
    { id: 'initial', label: 'Initial attempt' },
    { id: 'retry', label: 'Retry' },
    { id: 'verdict', label: 'Verdict' },
];

export function SharedStepper({
    step,
    onChange,
    enabled,
    idleHint = 'Complete both sides to step through evidence.',
}: {
    step: InvestigationStep;
    onChange: (step: InvestigationStep) => void;
    enabled: boolean;
    idleHint?: string;
}) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const activeIndex = STEPS.findIndex((item) => item.id === step);

    function select(index: number, moveFocus = true) {
        const next = STEPS[index];

        if (!next || !enabled) {
            return;
        }

        onChange(next.id);

        if (moveFocus) {
            refs.current[index]?.focus();
        }
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!enabled || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        let next = activeIndex;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            next = Math.min(STEPS.length - 1, activeIndex + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            next = Math.max(0, activeIndex - 1);
        } else if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = STEPS.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        select(next);
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p
                    id="investigation-step-label"
                    className="text-xs font-medium text-ink-faint"
                >
                    Investigation step
                </p>
                <p className="text-xs text-ink-faint" aria-live="polite">
                    {enabled
                        ? `Current: ${STEPS[activeIndex]?.label ?? step}`
                        : idleHint}
                </p>
            </div>
            <div
                role="tablist"
                aria-labelledby="investigation-step-label"
                aria-disabled={!enabled}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                onKeyDown={onKeyDown}
            >
                {STEPS.map((item, index) => {
                    const selected = item.id === step;

                    return (
                        <button
                            key={item.id}
                            ref={(node) => {
                                refs.current[index] = node;
                            }}
                            type="button"
                            role="tab"
                            id={`investigation-step-${item.id}`}
                            aria-selected={selected}
                            aria-current={selected ? 'step' : undefined}
                            aria-controls="investigation-workspace"
                            tabIndex={selected ? 0 : -1}
                            disabled={!enabled}
                            onClick={() => select(index)}
                            className={cn(
                                'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-45',
                                selected
                                    ? 'border-ink bg-ink text-white shadow-[0_0_0_1px_var(--color-ink)]'
                                    : 'border-line bg-surface-raised text-ink hover:bg-surface',
                            )}
                        >
                            <span className="font-mono text-[0.65rem] tracking-wide uppercase opacity-70">
                                Step {index + 1}
                            </span>
                            <span className="mt-0.5 block">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
