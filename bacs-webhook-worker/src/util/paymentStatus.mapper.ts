export const PAYMENT_TABLE_PROVIDER = {
  BACS: 'bacs',
} as const;

const RECOGNISED_UKSBS_STATUSES = new Set(['PAID', 'SUCCESS', 'COMPLETED', 'FAILED']);

/**
 * Validates that the UKSBS webhook's detail.status is one of the recognised
 * values, and returns it verbatim (exact casing/spelling as received) -
 * payment.status and the application_outbox payload should reflect exactly
 * what the webhook sent, not a translated/fixed internal value.
 * Returns null for anything unrecognised.
 */
export function mapUksbsStatusToPaymentStatus(uksbsStatus: string): string | null {
  return RECOGNISED_UKSBS_STATUSES.has(uksbsStatus.toUpperCase()) ? uksbsStatus : null;
}
