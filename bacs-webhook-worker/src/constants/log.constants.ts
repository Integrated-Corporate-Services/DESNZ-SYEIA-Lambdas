export const LOG_MESSAGES = {
  // Handler messages
  HANDLER_ERROR: 'Error in handler',
  NO_RECORDS: 'No records to process',

  // Worker messages
  PROCESSING_START: 'Starting to process webhook record',
  PROCESSING_SUCCESS: 'Successfully processed record',
  PROCESSING_FAILED: 'Failed to process record',

  // Database messages
  DB_CONNECT_ERROR: 'Database connection error',
  DB_QUERY_ERROR: 'Database query error',

  // Validation messages
  INVALID_PAYLOAD: 'Invalid webhook payload',
  MISSING_FIELD: 'Missing required field',

  // SQS messages
  SQS_SEND_ERROR: 'Failed to send SQS message',
  SQS_PROCESS_ERROR: 'Failed to process SQS message',
} as const;

export const LOG_PREFIXES = {
  HANDLER: '[HANDLER]',
  WORKER: '[WORKER]',
  REPOSITORY: '[REPOSITORY]',
  SERVICE: '[SERVICE]',
  UTIL: '[UTIL]',
} as const;
