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

function flagLine(name: string, value: boolean) {
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

function ComparisonCard({
    domain,
    kind,
    state,
}: {
    domain: ScenarioDomain;
    kind: ScenarioKind;
    state: Extract<PanelState, { phase: 'done' }>;
}) {
    const verification = deriveVerification(state.data.attempts);
    const stored = persistedCount(domain, state.data);
    const noun = persistedNoun(domain);
    const ids =
        verification.resource_ids.length === 0
            ? 'none'
            : verification.resource_ids.join(', ');

    return (
        <div
            className={`rounded border px-4 py-3 ${kind === 'vulnerable' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}
        >
            <h3 className="text-sm font-semibold text-gray-900">
                {kind === 'vulnerable' ? 'Vulnerable' : 'Protected'} {domain}
            </h3>
            <p className="mt-1 font-mono text-xs break-all text-gray-600">
                {state.data.run_id}
            </p>
            <dl className="mt-2">
                {flagLine(
                    'reproduction_succeeded',
                    verification.reproduction_succeeded,
                )}
                {flagLine('operation_safe', verification.operation_safe)}
                {flagLine(
                    'duplicate_resources',
                    verification.duplicate_resources,
                )}
                {flagLine(
                    'same_resource_on_retry',
                    verification.same_resource_on_retry,
                )}
            </dl>
            <p className="mt-2 text-xs break-words text-gray-700">
                Recorded resource ids: {ids}. {noun}: {stored}.
            </p>
        </div>
    );
}

export function ComparisonSummary({
    domain,
    vulnerable,
    protectedState,
}: {
    domain: ScenarioDomain;
    vulnerable: PanelState;
    protectedState: PanelState;
}) {
    const ready =
        vulnerable.phase === 'done' && protectedState.phase === 'done';

    return (
        <section className="mt-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
                Before / after comparison
            </h2>
            {ready ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ComparisonCard
                        domain={domain}
                        kind="vulnerable"
                        state={vulnerable}
                    />
                    <ComparisonCard
                        domain={domain}
                        kind="protected"
                        state={protectedState}
                    />
                </div>
            ) : (
                <p className="text-sm text-gray-500">
                    Run both scenarios to compare their recorded evidence.
                </p>
            )}
        </section>
    );
}
