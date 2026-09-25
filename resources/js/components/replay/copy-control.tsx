import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CopyControl({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    }

    return (
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <dt className="shrink-0 font-mono text-xs text-ink-faint">
                {label}
            </dt>
            <dd className="flex min-w-0 flex-1 items-start gap-2">
                <span className="min-w-0 flex-1 font-mono text-xs break-all text-ink">
                    {value}
                </span>
                <button
                    type="button"
                    onClick={() => {
                        void copy();
                    }}
                    className={cn(
                        'shrink-0 rounded-md border border-line bg-surface-raised px-2 py-1 text-[0.65rem] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                        copied && 'border-safe/40 text-safe',
                    )}
                >
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </dd>
        </div>
    );
}
