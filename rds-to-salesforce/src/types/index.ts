export interface OutboxJob {
  outbox_id: string;
  application_id: string;
  event_type: string;
  idempotency_key: string;
  payload_snapshot_json: string | Record<string, unknown>;
}

export interface OutboxSqsMessage {
  outboxId: string;
  applicationId: string;
  eventType: string;
  idempotencyKey: string;
  enqueuedAt: string;
}

export interface OutboxQueuedRepository {
  markQueued(outboxId: string): Promise<void>;
}

export interface SqsPublisher {
  publish(message: OutboxSqsMessage): Promise<string>;
}
