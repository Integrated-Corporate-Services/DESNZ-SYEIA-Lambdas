export const TERMINAL_STATUSES = ['PROCESSED', 'FATAL'] as const;

export const PROCESSING_STATUS = {
  RECEIVED: 'RECEIVED',
  ENQUEUING: 'ENQUEUING',
  ENQUEUED: 'ENQUEUED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FATAL: 'FATAL',
} as const;

export const LOG_MESSAGES = {
  HANDLER_INVOCATION_START: 'Lambda handler invoked',
  HANDLER_INVOCATION_COMPLETE: 'Lambda handler completed successfully',
  HANDLER_INVOCATION_FAILED: 'Lambda handler failed',
  EVENT_PROCESSED: 'Event processed successfully',
  EVENT_SKIPPED_TERMINAL: 'Event already in terminal state',
  EVENT_FATAL: 'Event marked as fatal',
  EVENT_RETRYABLE_FAILURE: 'Retryable failure occurred',
} as const;
