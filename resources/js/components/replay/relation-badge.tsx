import type { ResourceRelation } from '@/components/replay/types';
import { cn } from '@/lib/utils';

const LABELS: Record<ResourceRelation, string> = {
    initial: 'Initial resource',
    reused: 'Reused resource',
    new: 'New resource',
    unrecorded: 'No resource id',
};

const STYLES: Record<ResourceRelation, string> = {
    initial: 'bg-surface text-ink-muted ring-1 ring-line',
    reused: 'bg-safe-soft text-safe',
    new: 'bg-danger-soft text-danger',
    unrecorded: 'bg-surface text-ink-faint ring-1 ring-line',
};

export function RelationBadge({ relation }: { relation: ResourceRelation }) {
    return (
        <span
            className={cn(
                'inline-block rounded-md px-2 py-0.5 text-xs font-medium',
                STYLES[relation],
            )}
        >
            {LABELS[relation]}
        </span>
    );
}
