// Event type recorded in the shared `application_outbox` table (owned by desnz-syeia-backend-beta)
// whenever a BACS payment webhook has been successfully recorded/updated in our tables.
// Mirrors the naming convention used by other producers of this table,
// e.g. WITHDRAWL_REQUESTED in desnz-syeia-backend-beta/src/services/withdrawalService.js
export const BACS_PAYMENT_EVENT_TYPE = 'BACS_PAYMENT_EVENT';

export const APPLICATION_OUTBOX_STATUS = {
  PENDING: 'PENDING',
} as const;

export const APPLICATION_OUTBOX_TABLE = 'application_outbox';
