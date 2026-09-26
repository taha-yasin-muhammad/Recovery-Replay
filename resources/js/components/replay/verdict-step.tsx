import {
    deriveVerification,
    persistedCount,
    persistedNoun,
} from '@/components/replay/evidence';
import type {
    PanelState,
    ScenarioDomain,
    ScenarioKind,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

function VerdictCard({
    domain,
    kind,
    state,
}: {
    domain: ScenarioDomain;
    kind: ScenarioKind;
    state: Extract<PanelState, { phase: 'done' }>;
}) {
    const verification = deriveVerification(state.data.attempts);
    const count = persistedCount(domain, state.data);
    const noun = persistedNoun(domain).toLowerCase();
    const isVulnerable = kind === 'vulnerable';
    const resourceLabel =
        count === 1 ? `1 ${noun.slice(0, -1)}` : `${count} ${noun}`;

    const relationLine = isVulnerable
        ? verification.duplicate_resources
            ? 'Duplicate detected'
            : verification.same_resource_on_retry
              ? 'Same resource on retry'
              : 'No clear duplicate pattern'
        : verification.same_resource_on_retry
          ? 'Existing resource reused'
          : verification.duplicate_resources
            ? 'Duplicate detected'
            : 'Resource relation unclear';

    const safetyLine =
        verification.safety_result === 'safe'
            ? isVulnerable
                ? 'Operation safe'
                : 'Operation safe for the tested retry scenario'
            : verification.safety_result === 'unsafe'
              ? 'Operation unsafe'
              : 'Inconclusive — evidence does not support a safety conclusion';

    const outcomeLines = [resourceLabel, relationLine, safetyLine];

    return (
        <article
            className={cn(
                'rounded-2xl border border-line bg-surface-raised px-4 py-4',
                isVulnerable
                    ? 'border-l-[3px] border-l-danger'
                    : 'border-l-[3px] border-l-safe',
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <span
                    className={cn(
                        'rounded-md px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase',
                        isVulnerable
                            ? 'bg-danger-soft text-danger'
                            : 'bg-safe-soft text-safe',
                    )}
                >
                    {isVulnerable ? 'Before' : 'After'}
                </span>
                <span
                    className={cn(
                        'rounded-md px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase',
                        verification.safety_result === 'safe' &&
                            'bg-safe-soft text-safe',
                        verification.safety_result === 'unsafe' &&
                            'bg-danger-soft text-danger',
                        verification.safety_result === 'inconclusive' &&
                            'bg-warn-soft text-warn',
                    )}
                >
                    {verification.safety_result}
                </span>
                <h3 className="text-sm font-semibold text-ink">
                    {isVulnerable ? 'Vulnerable' : 'Protected'}
                </h3>
            </div>
            {verification.safety_result === 'inconclusive' && (
                <div
                    role="status"
                    className="mt-3 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
                >
                    Missing, incomplete, or contradictory evidence — safety
                    result is inconclusive.
                </div>
            )}
            <ul className="mt-3 flex flex-col gap-2">
                {outcomeLines.map((line) => (
                    <li key={line} className="text-sm leading-snug text-ink">
                        {line}
                    </li>
                ))}
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
                        {verification.reproduction_succeeded ? 'true' : 'false'}
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
                                : verification.safety_result === 'unsafe'
                                  ? 'text-danger'
                                  : 'text-ink',
                        )}
                    >
                        {verification.operation_safe ? 'true' : 'false'}
                    </dd>
                </div>
            </dl>
        </article>
    );
}

export function VerdictStep({
    domain,
    vulnerable,
    protectedState,
}: {
    domain: ScenarioDomain;
    vulnerable: Extract<PanelState, { phase: 'done' }>;
    protectedState: Extract<PanelState, { phase: 'done' }>;
}) {
    return (
        <section className="flex flex-col gap-3">
            <div>
                <h2 className="text-sm font-semibold text-ink">Verdict</h2>
                <p className="mt-1 text-xs text-ink-muted">
                    Compact comparison from recorded evidence only.
                </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VerdictCard
                    domain={domain}
                    kind="vulnerable"
                    state={vulnerable}
                />
                <VerdictCard
                    domain={domain}
                    kind="protected"
                    state={protectedState}
                />
            </div>
        </section>
    );
}
