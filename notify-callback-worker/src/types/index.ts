/**
 * Type Definitions for Notify Callback Worker Lambda
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
 * Notify status types from GOV.UK Notify
 */
export type NotifyStatus =
  | 'delivered'
  | 'permanent-failure'
  | 'temporary-failure'
  | 'technical-failure';

/**
 * SQS message payload structure (from relay Lambda)
 */
export interface NotifySqsMessage {
  eventId: string;
  notifyNotificationId: string;
  status: string;
  correlationId: string | null;
}

/**
 * Fatal message payload structure
 */
export interface FatalSqsMessage {
  eventId: string;
  notifyNotificationId: string;
  reason: string;
  originalPayload: unknown;
}

/**
 * Worker processing result
 */
export interface WorkerResult {
  eventId: string;
  outcome: 'PROCESSED' | 'SKIPPED_TERMINAL' | 'FATAL' | 'RETRY';
}

/**
 * Notify Callback Event Repository Interface
 */
export interface NotifyCallbackEventRepository {
  findById(id: string): Promise<NotifyCallbackEventRow | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markRetryableFailure(id: string, reason: string): Promise<void>;
  markFatal(id: string, reason: string): Promise<void>;
}
