export const LOG_MARKERS = {
  START: 'START',
  END: 'END',
} as const;

export type LogMarker = (typeof LOG_MARKERS)[keyof typeof LOG_MARKERS];

export const LOG_MESSAGES = {
  // Handler messages
  HANDLER_INVOCATION_START: 'invocation start',
  HANDLER_INVOCATION_COMPLETE: 'invocation complete',
  HANDLER_INVOCATION_FAILED: 'invocation failed',
  NO_RECORDS: 'no SQS records in event — nothing to do',

  // Batch / record messages
  SQS_RECORDS_RECEIVED: 'received SQS messages from queue',
  RECORD_CORRELATION_ID_ADOPTED: 'adopted envelope correlationId for traceability',
  RECORD_PROCESSED: 'record processed successfully',
  RECORD_FAILED: 'record processing failed — leaving message for retry/DLQ',
  BATCH_COMPLETE: 'batch complete',

  // Payload parsing / validation messages
  ENVELOPE_PARSED: 'parsed relay envelope from message body',
  ENVELOPE_PARSE_FAILED: 'failed to parse message body as relay envelope',
  PAYLOAD_VALIDATED: 'validated envelope structure',
  PAYLOAD_TRANSFORMED: 'transformed UKSBS payload into internal payment record',
  INVALID_PAYLOAD: 'invalid webhook payload',
  MISSING_FIELD: 'missing required field',

  // Payment processing messages
  PAYMENT_PROCESSING_START: 'starting payment processing',
  PAYMENT_PROCESSING_COMPLETE: 'payment processing completed',

  // Database messages
  DB_CONNECT_ERROR: 'database connection error',
  DB_CONNECTED: 'database connection verified',
  DB_QUERY_ERROR: 'database query error',
  PAYMENT_RECORDED: 'payment recorded in payments table',
  WEBHOOK_MARKED_PROCESSED: 'webhook marked as processed',
  WEBHOOK_ALREADY_PROCESSED: 'webhook not found or already processed — no rows updated',

  // SQS messages (worker does not publish, kept for parity/future use)
  SQS_SEND_ERROR: 'failed to send SQS message',
  SQS_PROCESS_ERROR: 'failed to process SQS message',

  // Application outbox messages
  OUTBOX_DISABLED: 'application outbox writes disabled — skipping (ENABLE_APPLICATION_OUTBOX is not "true")',
  OUTBOX_MISSING_APPLICATION_ID: 'cannot write outbox event — payment has no applicationId (paymentId)',
  OUTBOX_INVOICE_LOOKUP_FAILED:
    'cannot write outbox event — no invoice found for this payment reference (invoice_number)',
  OUTBOX_INVOICE_PAYMENT_METHOD_MISMATCH:
    'invoice matched but its payment_method is not BACS — proceeding anyway, but this may indicate a data anomaly',
  OUTBOX_DESNZ_REF_LOOKUP_FAILED: 'no desnz_ref found for this application — proceeding with desnzReference=null',
  OUTBOX_ALREADY_RECORDED: 'outbox event already recorded for this idempotency key — skipping duplicate insert',
  OUTBOX_EVENT_INSERTED: 'BACS payment event inserted into application_outbox',
  OUTBOX_INSERT_FAILED: 'failed to insert BACS payment event into application_outbox',
} as const;

export const LOG_PREFIXES = {
  HANDLER: '[HANDLER]',
  WORKER: '[WORKER]',
  REPOSITORY: '[REPOSITORY]',
  SERVICE: '[SERVICE]',
  UTIL: '[UTIL]',
} as const;
