export const SOURCE_BACS = 'BACS';

export const WEBHOOK_STATUS = {
  PENDING: 'pending',
  ENQUEUED: 'ENQUEUED',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRY_SCHEDULED: 'retry_scheduled',
  DEAD_LETTER: 'dead_letter',
} as const;

export type WebhookStatus = (typeof WEBHOOK_STATUS)[keyof typeof WEBHOOK_STATUS];

export const RELAY_UPDATED_BY = 'bacs-webhook-relay';

export const RELAY_ELIGIBLE_CREATED_BY = 'BACS-webhook-receiver';

export const RELAY_OUTCOME = {
  ENQUEUED: 'enqueued',
  POISONED: 'poisoned',
  FAILED: 'failed',
} as const;

export type RelayOutcome = (typeof RELAY_OUTCOME)[keyof typeof RELAY_OUTCOME];

export const BACS_WEBHOOK_RELAY_SCHEMA_VERSION = '1';
