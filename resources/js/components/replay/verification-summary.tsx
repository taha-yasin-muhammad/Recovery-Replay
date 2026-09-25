import {
    deriveVerification,
    explainVerification,
    persistedCount,
    persistedNoun,
} from '@/components/replay/evidence';
import type {
    ReplayAttempt,
    RunData,
    ScenarioDomain,
} from '@/components/replay/types';

function FlagRow({ name, value }: { name: string; value: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 py-1.5">
            <dt className="min-w-0 font-mono text-xs break-all text-gray-500">
                {name}
            </dt>
            <dd className="font-mono text-xs font-semibold text-gray-900">
                {value ? 'true' : 'false'}
            </dd>
        </div>
    );
}

function OutcomeChip({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: 'safe' | 'unsafe' | 'neutral';
}) {
    const colour =
        tone === 'safe'
            ? 'border-green-200 bg-green-50 text-green-900'
            : tone === 'unsafe'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-gray-200 bg-gray-50 text-gray-800';

    return (
        <div className={`rounded border px-2.5 py-1.5 ${colour}`}>
            <p className="text-[0.65rem] font-semibold tracking-wide uppercase opacity-75">
                {label}
            </p>
            <p className="font-mono text-sm font-semibold">{value}</p>
        </div>
    );
}

export function VerificationSummary({
    domain,
    attempts,
    data,
}: {
    domain: ScenarioDomain;
    attempts: ReplayAttempt[];
    data: Pick<RunData, 'orders' | 'reservations'>;
}) {
    const verification = deriveVerification(attempts);
    const stored = persistedCount(domain, data);
    const noun = persistedNoun(domain);
    const ids =
        verification.resource_ids.length === 0
            ? 'none'
            : verification.resource_ids.join(', ');

    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-gray-800">
                Verification summary
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <OutcomeChip
                    label="Attempts"
                    value={String(attempts.length)}
                    tone="neutral"
                />
                <OutcomeChip
                    label={noun}
                    value={String(stored)}
                    tone={
                        stored === 1
                            ? 'safe'
                            : stored > 1
                              ? 'unsafe'
                              : 'neutral'
                    }
                />
                <OutcomeChip
                    label="operation_safe"
                    value={verification.operation_safe ? 'true' : 'false'}
                    tone={verification.operation_safe ? 'safe' : 'unsafe'}
                />
                <OutcomeChip
                    label="Resource ids"
                    value={ids}
                    tone={
                        verification.resource_ids.length === 1
                            ? 'safe'
                            : verification.resource_ids.length > 1
                              ? 'unsafe'
                              : 'neutral'
                    }
                />
            </div>
            <details className="rounded border border-gray-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-gray-700">
                    Verification details
                </summary>
                <dl className="mt-2">
                    <FlagRow
                        name="reproduction_succeeded"
                        value={verification.reproduction_succeeded}
                    />
                    <FlagRow
                        name="operation_safe"
                        value={verification.operation_safe}
                    />
                    <FlagRow
                        name="duplicate_resources"
                        value={verification.duplicate_resources}
                    />
                    <FlagRow
                        name="same_resource_on_retry"
                        value={verification.same_resource_on_retry}
                    />
                </dl>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    {explainVerification(attempts)}
                </p>
            </details>
        </section>
    );
}
