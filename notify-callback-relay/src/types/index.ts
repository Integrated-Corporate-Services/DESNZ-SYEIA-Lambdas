/**
 * Type Definitions for Notify Callback Relay Lambda
 */

/**
 * Database row structure from notify_callback_event table
 */
export interface NotifyCallbackEventRow {
  id: string;
  notify_notification_id: string;
  reference: string | null;
  notification_type: string;
  status: string;
  payload_json: Record<string, unknown>;
  processing_status: string;
  failure_reason: string | null;
  correlation_id: string | null;
}

/**
 * SQS message payload structure
 */
export interface NotifySqsMessage {
  eventId: string;
  notifyNotificationId: string;
  status: string;
  correlationId: string | null;
}

/**
 * Relay execution metrics
 */
export interface RelayMetrics {
  claimed: number;   // Events claimed from RECEIVED
  enqueued: number;  // Events successfully published to SQS
  reverted: number;  // Events reverted to RECEIVED due to SQS failure
}
