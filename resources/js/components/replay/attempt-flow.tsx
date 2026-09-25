import type { ReactNode } from 'react';
import { RelationBadge } from '@/components/replay/relation-badge';
import { StatusBadge } from '@/components/replay/status-badge';
import {
    formatResourceIdentity,
    resourceIdOf,
    resourceRelation,
} from '@/components/replay/evidence';
import type {
    AttemptPresentation,
    ClientHttpResponse,
    ReplayAttempt,
} from '@/components/replay/types';
import { cn } from '@/lib/utils';

function clientResponseFor(
    attemptId: string,
    responses: ClientHttpResponse[],
): ClientHttpResponse | null {
    return (
        responses.find((response) => response.attempt_id === attemptId) ?? null
    );
}

function FlowArrow() {
    return (
        <div
            className="flex items-center justify-center py-1 text-ink-faint"
            aria-hidden="true"
        >
            <span className="font-mono text-xs">↓</span>
        </div>
    );
}

function FlowCard({
    title,
    children,
    tone = 'neutral',
}: {
    title: string;
    children: ReactNode;
    tone?: 'neutral' | 'danger' | 'safe' | 'warn';
}) {
    return (
        <div
            className={cn(
                'rounded-xl border px-3 py-3',
                tone === 'neutral' && 'border-line bg-surface/70',
                tone === 'danger' && 'border-danger/30 bg-danger-soft/60',
                tone === 'safe' && 'border-safe/30 bg-safe-soft/60',
                tone === 'warn' && 'border-warn/30 bg-warn-soft/70',
            )}
        >
            <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-ink-faint uppercase">
                {title}
            </p>
            <div className="mt-2 flex flex-col gap-1.5">{children}</div>
        </div>
    );
}

function ShortResourceId({
    attempt,
}: {
    attempt: ReplayAttempt | null | undefined;
}) {
    if (!attempt) {
        return <span className="font-mono text-sm text-ink-faint">—</span>;
    }

    const id = resourceIdOf(attempt);

    if (id === null) {
        return (
            <span className="font-mono text-sm text-ink-faint">
                no resource id
            </span>
        );
    }

    const type = attempt.resource_type ?? 'resource';

    return (
        <span className="font-mono text-sm font-semibold text-ink tabular-nums">
            {type} #{id}
        </span>
    );
}

function RetryDifference({
    kind,
    attempts,
}: {
    kind: AttemptPresentation;
    attempts: ReplayAttempt[];
}) {
    const initial = attempts[0];
    const retry = attempts[1];
    const initialId = initial ? resourceIdOf(initial) : null;
    const retryId = retry ? resourceIdOf(retry) : null;
    const relation = resourceRelation(attempts, 1);
    const retryLabel =
        kind === 'vulnerable'
            ? 'Retry resource'
            : kind === 'protected'
              ? 'Returned resource'
              : 'Retry resource';

    return (
        <div
            className={cn(
                'mt-3 rounded-xl border px-3 py-3',
                relation === 'new' && 'border-danger/35 bg-danger-soft/40',
                relation === 'reused' && 'border-safe/35 bg-safe-soft/40',
                relation !== 'new' &&
                    relation !== 'reused' &&
                    'border-line bg-surface/70',
            )}
            role="status"
        >
            <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-ink-faint uppercase">
                Resource relationship
            </p>
            <dl className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-xs text-ink-muted">Initial resource</dt>
                    <dd>
                        <ShortResourceId attempt={initial} />
                    </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-xs text-ink-muted">{retryLabel}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                        <ShortResourceId attempt={retry} />
                        <RelationBadge relation={relation} />
                    </dd>
                </div>
            </dl>
            <p className="mt-2 text-sm leading-snug font-medium text-ink">
                {relation === 'new' &&
                    initialId !== null &&
                    retryId !== null &&
                    'Same logical operation now has two resources.'}
                {relation === 'reused' &&
                    retryId !== null &&
                    'Existing resource returned — no new resource created.'}
                {relation !== 'new' &&
                    relation !== 'reused' &&
                    'Resource relationship could not be determined from recorded evidence.'}
            </p>
        </div>
    );
}

export function AttemptFlow({
    kind,
    attempts,
    attemptIndex,
    clientResponses,
}: {
    kind: AttemptPresentation;
    attempts: ReplayAttempt[];
    attemptIndex: number;
    clientResponses: ClientHttpResponse[];
}) {
    const attempt = attempts[attemptIndex];

    if (!attempt) {
        return (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-3 py-4 text-sm text-ink-faint">
                No recorded attempt for this step.
            </p>
        );
    }

    const client = clientResponseFor(attempt.attempt_id, clientResponses);
    const relation = resourceRelation(attempts, attemptIndex);
    const resourceId = resourceIdOf(attempt);
    const isInitial = attemptIndex === 0;
    const isProtectedRetry = !isInitial && kind === 'protected';
    const clientFailed =
        client !== null &&
        (client.http_status >= 500 || client.http_status === 503);
    const resourceExists = resourceId !== null;
    const discrepancy = isInitial && clientFailed && resourceExists;
    const highlightNew = !isInitial && relation === 'new';
    const highlightReuse = !isInitial && relation === 'reused';

    const requestLabel = isInitial
        ? kind === 'historical'
            ? 'Initial request'
            : 'Fault-injected request'
        : 'Retry request';
    const requestDetail = isInitial
        ? kind === 'historical'
            ? 'Recorded first attempt for this run. Scenario mode was not persisted.'
            : 'Client sends the first operation with fault injection enabled.'
        : kind === 'protected'
          ? 'Client retries with the same operation and idempotency key.'
          : kind === 'historical'
            ? 'Recorded retry for this run. Idempotency key usage was not persisted.'
            : 'Client retries the same operation without an idempotency key.';

    const serverTitle = isProtectedRetry
        ? 'Server-side result'
        : 'Server-side persistence';

    return (
        <div className="flex flex-col">
            <FlowCard title="Client request">
                <p className="text-sm font-medium text-ink">{requestLabel}</p>
                <p className="text-xs leading-relaxed text-ink-muted">
                    {requestDetail}
                </p>
            </FlowCard>

            <FlowArrow />

            <FlowCard
                title={serverTitle}
                tone={
                    highlightNew
                        ? 'danger'
                        : highlightReuse
                          ? 'safe'
                          : discrepancy
                            ? 'warn'
                            : 'neutral'
                }
            >
                {isProtectedRetry ? (
                    <>
                        <p className="text-sm font-medium text-ink">
                            Existing resource returned
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <ShortResourceId attempt={attempt} />
                            <RelationBadge relation={relation} />
                        </div>
                        <p className="text-xs text-ink-muted">
                            Resource count after attempt:{' '}
                            <span className="font-mono font-semibold text-ink">
                                {attempt.order_count_after}
                            </span>
                        </p>
                    </>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <ShortResourceId attempt={attempt} />
                            <RelationBadge relation={relation} />
                        </div>
                        <p className="text-xs text-ink-muted">
                            Resource count after attempt:{' '}
                            <span className="font-mono font-semibold text-ink">
                                {attempt.order_count_after}
                            </span>
                        </p>
                        {!resourceExists && (
                            <p className="text-xs text-ink-faint">
                                No resource id was recorded for this attempt.
                            </p>
                        )}
                    </>
                )}
            </FlowCard>

            <FlowArrow />

            <FlowCard
                title="Client response"
                tone={clientFailed ? 'danger' : client ? 'safe' : 'neutral'}
            >
                {client ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={client.http_status} />
                            <span className="text-sm font-medium text-ink">
                                HTTP {client.http_status}
                            </span>
                        </div>
                        {client.http_status === 503 && (
                            <p className="text-xs text-ink-muted">
                                Injected fault surfaced to the client as HTTP
                                503.
                            </p>
                        )}
                        {client.http_status !== attempt.http_status && (
                            <p className="text-xs text-warn">
                                Replay attempt recorded HTTP{' '}
                                {attempt.http_status}.
                            </p>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-ink-faint">
                        No captured client response for this attempt.
                    </p>
                )}
            </FlowCard>

            {discrepancy && (
                <div
                    role="status"
                    className="mt-3 rounded-xl border border-warn/35 bg-warn-soft px-3 py-2.5 text-sm text-warn"
                >
                    <p className="font-semibold">
                        Response failed, resource exists
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-warn/90">
                        The client saw a failed response, but{' '}
                        <span className="font-mono">
                            {formatResourceIdentity(attempt)}
                        </span>{' '}
                        was still recorded.
                    </p>
                </div>
            )}

            {!isInitial && <RetryDifference kind={kind} attempts={attempts} />}
        </div>
    );
}
