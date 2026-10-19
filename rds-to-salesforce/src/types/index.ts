export interface OutboxJob {
  outbox_id: string;
  application_id: string | null;
  user_id?: string | null;
  event_type: string;
  idempotency_key: string;
  payload_snapshot_json: string | Record<string, unknown>;
}

export interface OutboxSqsMessage {
  outboxId: string;
  applicationId: string | null;
  applicantId: string | null;
  eventType: string;
  idempotencyKey: string;
  enqueuedAt: string;
}

export interface OutboxQueuedRepository {
  markQueued(outboxId: string): Promise<void>;
}

export type SqsMessageAttributes = Record<string, { DataType: 'String'; StringValue: string }>;

export interface SqsPublisher {
  publish(message: OutboxSqsMessage, attributes: SqsMessageAttributes): Promise<string>;
}
