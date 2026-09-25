import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { RelationBadge } from '@/components/replay/relation-badge';
import { StatusBadge } from '@/components/replay/status-badge';
import {
    attemptLabel,
    attemptsShareTimestamp,
    formatResourceIdentity,
    resourceIdOf,
    resourceRelation,
} from '@/components/replay/evidence';
import type {
    ClientHttpResponse,
    ReplayAttempt,
} from '@/components/replay/types';

function formatTime(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return iso;
    }

    return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function clientResponseFor(
    attemptId: string,
    responses: ClientHttpResponse[],
): ClientHttpResponse | null {
    return (
        responses.find((response) => response.attempt_id === attemptId) ?? null
    );
}

function clientStatusLabel(response: ClientHttpResponse | null): string {
    if (response === null) {
        return 'No captured client response';
    }

    return `Received HTTP ${response.http_status}`;
}

function ResourceConnector({
    from,
    to,
    relation,
}: {
    from: ReplayAttempt;
    to: ReplayAttempt;
    relation: ReturnType<typeof resourceRelation>;
}) {
    const fromId = resourceIdOf(from);
    const toId = resourceIdOf(to);

    if (fromId === null && toId === null) {
        return null;
    }

    const same = fromId !== null && fromId === toId;
    const tone = same
        ? 'border-green-300 text-green-800'
        : relation === 'new'
          ? 'border-red-300 text-red-800'
          : 'border-gray-300 text-gray-700';

    let label: string;

    if (same && fromId !== null) {
        label = `Same resource id ${fromId}`;
    } else if (fromId !== null && toId !== null) {
        label = `Resource id ${fromId} → ${toId}`;
    } else if (toId !== null) {
        label = `Resource id ${toId}`;
    } else {
        label = `Resource id ${fromId}`;
    }

    return (
        <div
            className={`mx-3 flex items-center gap-2 border-l-2 py-1 pl-3 sm:mx-6 ${tone}`}
            aria-hidden="true"
        >
            <span className="font-mono text-xs break-all">{label}</span>
            <RelationBadge relation={relation} />
        </div>
    );
}

function Lane({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="min-w-0 rounded border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="text-[0.65rem] font-semibold tracking-wide text-gray-500 uppercase">
                {title}
            </p>
            <div className="mt-1 flex flex-col gap-1">{children}</div>
        </div>
    );
}

export function ReplayTimeline({
    attempts,
    clientResponses,
    selectedIndex,
    showAll,
    onSelect,
    onToggleShowAll,
}: {
    attempts: ReplayAttempt[];
    clientResponses: ClientHttpResponse[];
    selectedIndex: number;
    showAll: boolean;
    onSelect: (index: number) => void;
    onToggleShowAll: () => void;
}) {
    const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const shareTimestamp = attemptsShareTimestamp(attempts);
    const previousDisabled = attempts.length === 0 || selectedIndex <= 0;
    const nextDisabled =
        attempts.length === 0 || selectedIndex >= attempts.length - 1;

    function moveSelection(index: number) {
        onSelect(index);
        buttonRefs.current[index]?.focus();
    }

    function handleAttemptKeyDown(
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
    ) {
        if (attempts.length === 0) {
            return;
        }

        let next = index;

        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            next = Math.min(attempts.length - 1, index + 1);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            next = Math.max(0, index - 1);
        } else if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = attempts.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        moveSelection(next);
    }

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h3 className="text-base font-semibold text-gray-900">
                        Replay timeline
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                        Client lane shows the captured HTTP response. Server
                        lane shows the recorded persistence evidence.
                    </p>
                </div>
                <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Timeline navigation"
                >
                    <button
                        type="button"
                        onClick={() => onSelect(selectedIndex - 1)}
                        disabled={previousDisabled}
                        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        type="button"
                        onClick={() => onSelect(selectedIndex + 1)}
                        disabled={nextDisabled}
                        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Next
                    </button>
                    <button
                        type="button"
                        onClick={onToggleShowAll}
                        disabled={attempts.length === 0}
                        aria-pressed={showAll}
                        className={`rounded border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${showAll ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}
                    >
                        Show all
                    </button>
                </div>
            </div>
            {shareTimestamp && (
                <p className="text-xs text-gray-500">
                    These attempts share a timestamp. Display order follows the
                    recorded attempt sequence.
                </p>
            )}
            {attempts.length === 0 ? (
                <p className="rounded border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-500">
                    No attempts were recorded for this run.
                </p>
            ) : (
                <ol
                    className="flex flex-col"
                    aria-label="Recorded attempts with client and server lanes"
                >
                    {attempts.map((attempt, index) => {
                        const selected = index === selectedIndex;
                        const relation = resourceRelation(attempts, index);
                        const client = clientResponseFor(
                            attempt.attempt_id,
                            clientResponses,
                        );
                        const resourceBorder =
                            relation === 'new'
                                ? 'border-red-300'
                                : relation === 'reused'
                                  ? 'border-green-300'
                                  : 'border-gray-300';

                        return (
                            <li
                                key={attempt.attempt_id}
                                className="flex flex-col"
                            >
                                {index > 0 && (
                                    <ResourceConnector
                                        from={attempts[index - 1]!}
                                        to={attempt}
                                        relation={relation}
                                    />
                                )}
                                <button
                                    type="button"
                                    ref={(node) => {
                                        buttonRefs.current[index] = node;
                                    }}
                                    onClick={() => onSelect(index)}
                                    onKeyDown={(event) =>
                                        handleAttemptKeyDown(event, index)
                                    }
                                    aria-current={selected ? 'step' : undefined}
                                    className={`w-full rounded border bg-white px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${resourceBorder} ${selected ? 'ring-2 ring-gray-900' : 'hover:border-gray-500'}`}
                                >
                                    <span className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-gray-900">
                                            {index + 1}.{' '}
                                            {attemptLabel(
                                                index,
                                                attempts.length,
                                            )}
                                        </span>
                                        <RelationBadge relation={relation} />
                                    </span>
                                    <span className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <Lane title="Client">
                                            <span className="flex flex-wrap items-center gap-2">
                                                {client ? (
                                                    <StatusBadge
                                                        status={
                                                            client.http_status
                                                        }
                                                    />
                                                ) : (
                                                    <span className="text-xs text-gray-500">
                                                        —
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-700">
                                                    {clientStatusLabel(client)}
                                                </span>
                                            </span>
                                            {client &&
                                                client.http_status !==
                                                    attempt.http_status && (
                                                    <span className="text-xs text-amber-800">
                                                        Recorded status differs:
                                                        HTTP{' '}
                                                        {attempt.http_status}
                                                    </span>
                                                )}
                                        </Lane>
                                        <Lane title="Server">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <StatusBadge
                                                    status={attempt.http_status}
                                                />
                                                <span className="font-mono text-xs break-all text-gray-800">
                                                    {formatResourceIdentity(
                                                        attempt,
                                                    )}
                                                </span>
                                            </span>
                                            <span className="text-xs text-gray-600">
                                                Persisted count{' '}
                                                {attempt.order_count_after}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {formatTime(
                                                    attempt.attempted_at,
                                                )}
                                            </span>
                                        </Lane>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
