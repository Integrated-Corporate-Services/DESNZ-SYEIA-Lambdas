/**
 * Application Constants
 */

/**
 * Terminal processing statuses (cannot be reprocessed)
 */
export const TERMINAL_STATUSES = ['PROCESSED', 'FATAL'] as const;

/**
 * Processing status values
 */
export const PROCESSING_STATUS = {
  RECEIVED: 'RECEIVED',
  ENQUEUING: 'ENQUEUING',
  ENQUEUED: 'ENQUEUED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FATAL: 'FATAL',
} as const;

/**
 * Notify delivery status values
 */
export const NOTIFY_STATUS = {
  DELIVERED: 'delivered',
  PERMANENT_FAILURE: 'permanent-failure',
  TEMPORARY_FAILURE: 'temporary-failure',
  TECHNICAL_FAILURE: 'technical-failure',
} as const;

/**
 * Log messages
 */
export const LOG_MESSAGES = {
  HANDLER_INVOCATION_START: 'Lambda handler invoked',
  HANDLER_INVOCATION_COMPLETE: 'Lambda handler completed successfully',
  HANDLER_INVOCATION_FAILED: 'Lambda handler failed',
  EVENT_PROCESSED: 'Event processed successfully',
  EVENT_SKIPPED_TERMINAL: 'Event already in terminal state',
  EVENT_FATAL: 'Event marked as fatal',
  EVENT_RETRYABLE_FAILURE: 'Retryable failure occurred',
} as const;
