import type { InvestigationStep } from '@/components/replay/types';

const ACTIONS: Record<
    InvestigationStep,
    { next: InvestigationStep; label: string }
> = {
    initial: {
        next: 'retry',
        label: 'Next: See what happens on retry',
    },
    retry: {
        next: 'verdict',
        label: 'Next: View verdict',
    },
    verdict: {
        next: 'retry',
        label: 'Back to retry',
    },
};

export function StepContinue({
    step,
    enabled,
    onChange,
}: {
    step: InvestigationStep;
    enabled: boolean;
    onChange: (step: InvestigationStep) => void;
}) {
    if (!enabled) {
        return null;
    }

    const action = ACTIONS[step];

    return (
        <div className="flex justify-center border-t border-line pt-4">
            <button
                type="button"
                onClick={() => onChange(action.next)}
                className="inline-flex w-full max-w-md items-center justify-center rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-auto"
            >
                {action.label}
            </button>
        </div>
    );
}
