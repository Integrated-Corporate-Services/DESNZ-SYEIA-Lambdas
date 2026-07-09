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
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FATAL: 'FATAL',
} as const;

/**
 * Salesforce API operation types
 */
export const SALESFORCE_OPERATION = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  UPSERT: 'UPSERT',
  DELETE: 'DELETE',
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
  SALESFORCE_API_SUCCESS: 'Salesforce API call succeeded',
  SALESFORCE_API_FAILED: 'Salesforce API call failed',
} as const;

/**
 * Salesforce API HTTP status codes
 */
export const SALESFORCE_STATUS_CODES = {
  SUCCESS: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
