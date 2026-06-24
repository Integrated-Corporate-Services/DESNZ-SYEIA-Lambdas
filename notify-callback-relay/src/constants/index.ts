/**
 * Application Constants
 */

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
 * Log messages
 */
export const LOG_MESSAGES = {
  HANDLER_INVOCATION_START: 'Lambda handler invoked',
  HANDLER_INVOCATION_COMPLETE: 'Lambda handler completed successfully',
  HANDLER_INVOCATION_FAILED: 'Lambda handler failed',
  NO_EVENTS_TO_PROCESS: 'No RECEIVED events to process',
  EVENTS_CLAIMED: 'Events claimed successfully',
  EVENT_ENQUEUED: 'Event published to SQS',
  EVENT_REVERTED: 'Event reverted to RECEIVED after SQS failure',
} as const;
