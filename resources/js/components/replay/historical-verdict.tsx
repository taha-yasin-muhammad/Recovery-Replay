import {
    deriveVerification,
    persistedCount,
    persistedNoun,
} from '@/components/replay/evidence';
import type {
    PanelState,
    RunSummary,
    ScenarioDomain,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

function domainFromResourceType(
    resourceType: string | null,
): ScenarioDomain | null {
    if (resourceType === 'order') {
        return 'checkout';
    }

    if (resourceType === 'reservation') {
        return 'reservation';
    }

    return null;
}

export function HistoricalVerdict({
    summary,
    state,
}: {
    summary: RunSummary;
    state: Extract<PanelState, { phase: 'done' }>;
}) {
    const domain = domainFromResourceType(summary.resource_type);
    const verification = deriveVerification(state.data.attempts);
    const count =
        domain === null
            ? summary.resource_count
            : persistedCount(domain, state.data);
    const noun =
        domain === null ? 'resources' : persistedNoun(domain).toLowerCase();
    const resourceLabel =
        count === 1
            ? `1 ${noun.endsWith('s') ? noun.slice(0, -1) : noun}`
            : `${count} ${noun}`;

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h2 className="text-sm font-semibold text-ink">Verdict</h2>
                <p className="mt-1 text-xs text-ink-muted">
                    Derived from this run’s persisted evidence only. Scenario
                    mode and Before/After pairing were not recorded.
                </p>
            </div>

            {summary.incomplete && (
                <div
                    role="status"
                    className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn"
                >
                    Incomplete evidence — fewer than two attempts were recorded.
                    Safety result is inconclusive.
                </div>
            )}

            <article className="rounded-2xl border border-l-[3px] border-line border-l-accent bg-surface-raised px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            'rounded-md px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase',
                            summary.safety_result === 'safe' &&
                                'bg-safe-soft text-safe',
                            summary.safety_result === 'unsafe' &&
                                'bg-danger-soft text-danger',
                            summary.safety_result === 'inconclusive' &&
                                'bg-warn-soft text-warn',
                        )}
                    >
                        {summary.safety_result}
                    </span>
                    <h3 className="text-sm font-semibold text-ink">
                        Evidence-backed safety
                    </h3>
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                    <li className="text-sm leading-snug text-ink">
                        {resourceLabel}
                    </li>
                    <li className="text-sm leading-snug text-ink">
                        {verification.duplicate_resources
                            ? 'Duplicate resources recorded'
                            : verification.same_resource_on_retry
                              ? 'Same resource on retry'
                              : 'Resource relation unclear from evidence'}
                    </li>
                    <li className="text-sm leading-snug text-ink">
                        Resource type: {summary.resource_type ?? 'unavailable'}
                    </li>
                </ul>

                <dl className="mt-4 border-t border-line pt-3">
                    <div className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="font-mono text-xs text-ink-faint">
                            reproduction_succeeded
                        </dt>
                        <dd
                            className={cn(
                                'font-mono text-xs font-semibold',
                                verification.reproduction_succeeded
                                    ? 'text-safe'
                                    : 'text-ink',
                            )}
                        >
                            {verification.reproduction_succeeded
                                ? 'true'
                                : 'false'}
                        </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="font-mono text-xs text-ink-faint">
                            operation_safe
                        </dt>
                        <dd
                            className={cn(
                                'font-mono text-xs font-semibold',
                                verification.operation_safe
                                    ? 'text-safe'
                                    : 'text-danger',
                            )}
                        >
                            {verification.operation_safe ? 'true' : 'false'}
                        </dd>
                    </div>
                </dl>
            </article>
        </section>
    );
}
