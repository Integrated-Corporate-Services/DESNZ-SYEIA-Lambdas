export const PAYMENT_TABLE_PROVIDER = {
  BACS: 'bacs',
} as const;

const RECOGNISED_UKSBS_STATUSES = new Set(['PAID', 'SUCCESS', 'COMPLETED', 'FAILED']);

export function mapUksbsStatusToPaymentStatus(uksbsStatus: string): string | null {
  return RECOGNISED_UKSBS_STATUSES.has(uksbsStatus.toUpperCase()) ? uksbsStatus : null;
}
