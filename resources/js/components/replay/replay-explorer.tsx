import { useId, useState } from 'react';
import { AttemptDetails } from '@/components/replay/attempt-details';
import {
    findPersistedResource,
    orderAttempts,
} from '@/components/replay/evidence';
import { ReplayTimeline } from '@/components/replay/replay-timeline';
import type {
    ClientHttpResponse,
    RunData,
    ScenarioDomain,
} from '@/components/replay/types';
import { VerificationSummary } from '@/components/replay/verification-summary';

function clientResponseFor(
    attemptId: string,
    responses: ClientHttpResponse[],
): ClientHttpResponse | null {
    return (
        responses.find((response) => response.attempt_id === attemptId) ?? null
    );
}

export function ReplayExplorer({
    domain,
    data,
    clientResponses,
}: {
    domain: ScenarioDomain;
    data: RunData;
    clientResponses: ClientHttpResponse[];
}) {
    const ordered = orderAttempts(data.attempts);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showAll, setShowAll] = useState(false);
    const inspectorId = useId();
    const safeIndex =
        ordered.length === 0 ? 0 : Math.min(selectedIndex, ordered.length - 1);
    const selected = ordered[safeIndex] ?? null;

    function selectAttempt(index: number) {
        if (ordered.length === 0) {
            return;
        }

        const next = Math.min(Math.max(index, 0), ordered.length - 1);
        setShowAll(false);
        setSelectedIndex(next);
    }

    const visibleAttempts = showAll || selected === null ? ordered : [selected];

    return (
        <div className="flex flex-col gap-4">
            <p className="rounded border border-gray-200 bg-white px-3 py-2 text-xs break-all text-gray-500">
                <span className="font-medium text-gray-700">Run ID: </span>
                <span className="font-mono">{data.run_id}</span>
            </p>
            <ReplayTimeline
                attempts={ordered}
                clientResponses={clientResponses}
                selectedIndex={safeIndex}
                showAll={showAll}
                onSelect={selectAttempt}
                onToggleShowAll={() => setShowAll((current) => !current)}
            />
            <VerificationSummary
                domain={domain}
                attempts={ordered}
                data={data}
            />
            <section id={inspectorId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-800">
                        Evidence inspector
                    </h3>
                    <p className="text-xs text-gray-500">
                        {showAll
                            ? 'Showing all recorded attempts'
                            : 'Selected attempt'}
                    </p>
                </div>
                <p className="sr-only" aria-live="polite">
                    {ordered.length === 0
                        ? 'No attempt selected.'
                        : showAll
                          ? `Showing all ${ordered.length} attempts.`
                          : `Showing attempt ${safeIndex + 1} of ${ordered.length}.`}
                </p>
                {ordered.length === 0 ? (
                    <p className="rounded border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-500">
                        No replay attempts were recorded for this run.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {visibleAttempts.map((attempt) => {
                            const index = ordered.findIndex(
                                (item) =>
                                    item.attempt_id === attempt.attempt_id,
                            );

                            return (
                                <AttemptDetails
                                    key={attempt.attempt_id}
                                    attempt={attempt}
                                    index={index}
                                    total={ordered.length}
                                    clientResponse={clientResponseFor(
                                        attempt.attempt_id,
                                        clientResponses,
                                    )}
                                    persisted={findPersistedResource(
                                        attempt,
                                        data,
                                    )}
                                />
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
