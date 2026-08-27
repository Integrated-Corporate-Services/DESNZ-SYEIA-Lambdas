/**
 * Type definitions for the SQS delivery feature (ENABLE_SQS_DELIVERY=true).
 * Mirrors the layout of rds-to-salesforce-worker/src/types - everything under
 * src/ is self-contained and only runs when the flag is on. All other,
 * pre-existing logic in this lambda is untouched and keeps running when the
 * flag is false/unset.
 */

/**
 * Outbox row shape as read from application_outbox
 */
export interface OutboxJob {
  outbox_id: number;
  application_id: string;
  event_type: string | null;
  payload_snapshot_json: string | Record<string, unknown>;
}

/**
 * Message body published to the Salesforce events SQS queue
 */
export interface OutboxSqsMessage {
  outboxId: number;
  applicationId: string;
  eventType: string | null;
  enqueuedAt: string;
}

/**
 * Repository interface for marking an outbox row as queued for SQS delivery
 */
export interface OutboxQueuedRepository {
  markQueued(outboxId: number): Promise<void>;
}

/**
 * Publisher interface for sending a message to the Salesforce events queue
 */
export interface SqsPublisher {
  publish(message: OutboxSqsMessage): Promise<string>;
}
