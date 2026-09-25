export type ScenarioDomain = 'checkout' | 'reservation';

export type ScenarioKind = 'vulnerable' | 'protected';

export interface ReplayAttempt {
    id: number;
    run_id: string;
    attempt_id: string;
    operation_id: string;
    order_id: number | null;
    resource_type: string | null;
    resource_id: number | null;
    http_status: number;
    order_count_after: number;
    attempted_at: string;
}

export interface PersistedResource {
    id: number;
    operation_id?: string;
    status?: string;
    created_at?: string;
    updated_at?: string;
    idempotency_key?: string | null;
}

export interface RunData {
    run_id: string;
    attempts: ReplayAttempt[];
    orders: PersistedResource[];
    reservations: PersistedResource[];
}

export interface ClientHttpResponse {
    attempt_id: string;
    http_status: number;
    body: unknown;
}

export interface Verification {
    reproduction_succeeded: boolean;
    operation_safe: boolean;
    duplicate_resources: boolean;
    same_resource_on_retry: boolean;
    resource_ids: number[];
}

export type ResourceRelation = 'initial' | 'reused' | 'new' | 'unrecorded';

export type PanelState =
    | { phase: 'idle' }
    | { phase: 'running'; step: string }
    | {
          phase: 'done';
          data: RunData;
          clientResponses: ClientHttpResponse[];
      }
    | { phase: 'error'; message: string };

export interface ScenarioResult {
    data: RunData;
    clientResponses: ClientHttpResponse[];
}
