export interface OutboxSqsMessage {
  outboxId: string;
  applicationId: string;
  eventType: string;
  idempotencyKey: string;
  enqueuedAt: string;
}

export interface ApplicationOutboxRow {
  outbox_id: string;
  application_id: string;
  event_type: string;
  payload_snapshot_json: Record<string, unknown>;
  idempotency_key: string;
  salesforce_record_id: string | null;
  status: string;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  last_response_payload: Record<string, unknown> | null;
  next_attempt_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WorkerResult {
  outboxId: string;
  outcome: 'SENT' | 'SKIPPED_TERMINAL' | 'RETRY' | 'FATAL';
}

export interface FailedAttemptResult {
  attemptCount: number;
  status: string;
}

export interface ApplicationOutboxRepository {
  findByOutboxId(outboxId: string): Promise<ApplicationOutboxRow | null>;
  markSent(outboxId: string, salesforceRecordId: string, responsePayload: Record<string, unknown>): Promise<void>;
  recordFailedAttempt(
    outboxId: string,
    params: { errorCode: string; errorMessage: string; responsePayload: Record<string, unknown> | null; maxRetries: number },
  ): Promise<FailedAttemptResult>;
  markFatal(
    outboxId: string,
    params: { errorCode: string; errorMessage: string; responsePayload: Record<string, unknown> | null },
  ): Promise<void>;
}

export interface SalesforceIngestResponse {
  success?: boolean;
  id?: string;
  errors?: unknown[];
}
