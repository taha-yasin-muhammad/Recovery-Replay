import type { ResourceRelation } from '@/components/replay/types';

const LABELS: Record<ResourceRelation, string> = {
    initial: 'Initial resource',
    reused: 'Reused resource',
    new: 'New resource',
    unrecorded: 'No resource id',
};

const STYLES: Record<ResourceRelation, string> = {
    initial: 'bg-gray-100 text-gray-700',
    reused: 'bg-green-100 text-green-800',
    new: 'bg-red-100 text-red-800',
    unrecorded: 'bg-gray-100 text-gray-500',
};

export function RelationBadge({ relation }: { relation: ResourceRelation }) {
    return (
        <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STYLES[relation]}`}
        >
            {LABELS[relation]}
        </span>
    );
}
