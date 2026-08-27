export interface OutboxJob {
  outbox_id: number;
  application_id: string;
  event_type: string | null;
  payload_snapshot_json: string | Record<string, unknown>;
}

export interface OutboxSqsMessage {
  outboxId: number;
  applicationId: string;
  eventType: string | null;
  enqueuedAt: string;
}

export interface OutboxQueuedRepository {
  markQueued(outboxId: number): Promise<void>;
}

export interface SqsPublisher {
  publish(message: OutboxSqsMessage): Promise<string>;
}
