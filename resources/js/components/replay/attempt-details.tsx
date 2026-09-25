import { StatusBadge } from '@/components/replay/status-badge';
import {
    attemptLabel,
    persistedFieldEntries,
} from '@/components/replay/evidence';
import type {
    ClientHttpResponse,
    PersistedResource,
    ReplayAttempt,
} from '@/components/replay/types';

function formatBody(body: unknown): string {
    if (body === null || body === undefined || body === '') {
        return 'Empty response body';
    }

    if (typeof body === 'string') {
        return body;
    }

    try {
        return JSON.stringify(body, null, 2);
    } catch {
        return 'Response body could not be displayed.';
    }
}

function readMessage(body: unknown): string | null {
    if (typeof body !== 'object' || body === null || !('message' in body)) {
        return null;
    }

    const message = body.message;

    return typeof message === 'string' ? message : null;
}

function ClientResponseView({
    response,
    recordedStatus,
}: {
    response: ClientHttpResponse | null;
    recordedStatus: number;
}) {
    if (response === null) {
        return (
            <p className="text-sm text-gray-500">
                This attempt has no captured client response.
            </p>
        );
    }

    const formatted = formatBody(response.body);
    const message = readMessage(response.body);
    const isLarge = formatted.length > 280;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={response.http_status} />
                {response.http_status === 503 && (
                    <span className="text-xs text-gray-600">
                        Injected fault recorded for this attempt.
                    </span>
                )}
            </div>
            {response.http_status !== recordedStatus && (
                <p className="text-sm text-amber-800">
                    The client received HTTP {response.http_status}. The replay
                    attempt recorded HTTP {recordedStatus}.
                </p>
            )}
            {message && (
                <p className="text-sm break-words text-gray-800">{message}</p>
            )}
            {isLarge ? (
                <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-700">
                        Response body
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-gray-700">
                        {formatted}
                    </pre>
                </details>
            ) : (
                <pre className="max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap text-gray-700">
                    {formatted}
                </pre>
            )}
        </div>
    );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-1 gap-0.5 border-t border-gray-100 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
            <dt className="font-mono text-xs text-gray-500">{label}</dt>
            <dd className="min-w-0 font-mono text-xs break-all text-gray-800">
                {value}
            </dd>
        </div>
    );
}

function PersistedResourceView({
    kind,
    resource,
}: {
    kind: string | null;
    resource: PersistedResource | null;
}) {
    if (resource === null) {
        return (
            <p className="text-sm text-gray-500">
                The evidence response did not include a persisted{' '}
                {kind ?? 'resource'} for this attempt.
            </p>
        );
    }

    const fields = persistedFieldEntries(resource);

    return (
        <div>
            <h5 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Persisted {kind ?? 'resource'}
            </h5>
            <dl>
                {fields.map((field) => (
                    <EvidenceRow
                        key={field.key}
                        label={field.key}
                        value={field.value}
                    />
                ))}
            </dl>
        </div>
    );
}

export function AttemptDetails({
    attempt,
    index,
    total,
    clientResponse,
    persisted,
}: {
    attempt: ReplayAttempt;
    index: number;
    total: number;
    clientResponse: ClientHttpResponse | null;
    persisted: { kind: string; resource: PersistedResource } | null;
}) {
    const resourceId =
        attempt.resource_id === null ? 'null' : String(attempt.resource_id);
    const resourceType = attempt.resource_type ?? 'null';

    return (
        <article className="rounded border border-gray-200 bg-white p-3">
            <h4 className="text-sm font-semibold text-gray-900">
                {attemptLabel(index, total)}
            </h4>
            <div className="mt-3 flex flex-col gap-4">
                <section>
                    <h5 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        Client-visible HTTP response
                    </h5>
                    <ClientResponseView
                        response={clientResponse}
                        recordedStatus={attempt.http_status}
                    />
                </section>
                <section>
                    <h5 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        Server-side persistence
                    </h5>
                    <dl>
                        <EvidenceRow label="run_id" value={attempt.run_id} />
                        <EvidenceRow
                            label="attempt_id"
                            value={attempt.attempt_id}
                        />
                        <EvidenceRow
                            label="http_status"
                            value={String(attempt.http_status)}
                        />
                        <EvidenceRow
                            label="resource_type"
                            value={resourceType}
                        />
                        <EvidenceRow label="resource_id" value={resourceId} />
                        <EvidenceRow
                            label="attempted_at"
                            value={attempt.attempted_at}
                        />
                        <EvidenceRow
                            label="order_count_after"
                            value={String(attempt.order_count_after)}
                        />
                        {typeof attempt.order_id === 'number' &&
                            attempt.order_id !== attempt.resource_id && (
                                <EvidenceRow
                                    label="order_id"
                                    value={String(attempt.order_id)}
                                />
                            )}
                    </dl>
                    <div className="mt-3">
                        <PersistedResourceView
                            kind={
                                persisted?.kind ?? attempt.resource_type ?? null
                            }
                            resource={persisted?.resource ?? null}
                        />
                    </div>
                </section>
            </div>
        </article>
    );
}
