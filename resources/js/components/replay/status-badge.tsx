import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: number }) {
    const isOk = status >= 200 && status < 300;
    const isServerError = status >= 500;

    return (
        <span
            className={cn(
                'inline-block rounded-md px-2 py-0.5 font-mono text-xs font-semibold tabular-nums',
                isOk && 'bg-safe-soft text-safe',
                isServerError && 'bg-danger-soft text-danger',
                !isOk && !isServerError && 'bg-warn-soft text-warn',
            )}
        >
            {status}
        </span>
    );
}
