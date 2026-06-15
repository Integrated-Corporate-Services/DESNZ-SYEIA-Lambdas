// Constants for payment webhook processing

// Database table names
export const TABLE_PAYMENT_WEBHOOKS = 'payment_webhooks';

// Payment statuses (must match inbound-event-receiver: status = 'pending')
export const STATUS_PROCESSING = 'pending';

// SQS configuration
export const SQS_BATCH_LIMIT = 10;

// Logging prefixes
export const LOG_PREFIX = '[Scheduler]';
