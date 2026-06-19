/** payment_webhooks.status values (aligned with payment service + relay) */
export const WEBHOOK_STATUS = {
  PENDING: 'pending',
  PROCESSED: 'processed',
  FAILED: 'failed',
} as const;

/** application_outbox.status for rds-to-salesforce consumer */
export const APPLICATION_OUTBOX_STATUS = {
  PENDING: 'PENDING',
} as const;
