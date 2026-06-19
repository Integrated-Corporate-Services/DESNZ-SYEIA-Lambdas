export const SOURCE_BACS = 'BACS';

export const WEBHOOK_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRY_SCHEDULED: 'retry_scheduled',
  DEAD_LETTER: 'dead_letter',
} as const;

export type WebhookStatus = (typeof WEBHOOK_STATUS)[keyof typeof WEBHOOK_STATUS];

export const RELAY_UPDATED_BY = 'pay-callback-relay';

export const RELAY_OUTCOME = {
  ENQUEUED: 'enqueued',
  POISONED: 'poisoned',
  FAILED: 'failed',
} as const;

export type RelayOutcome = (typeof RELAY_OUTCOME)[keyof typeof RELAY_OUTCOME];

export const BACS_WEBHOOK_RELAY_SCHEMA_VERSION = '1';
