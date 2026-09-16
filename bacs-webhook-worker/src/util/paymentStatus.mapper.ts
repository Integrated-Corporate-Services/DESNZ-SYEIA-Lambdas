export const PAYMENT_TABLE_STATUS = {
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

/**
 * Map UKSBS webhook detail.status onto the shared `payment.status` values
 * used by the backend (`pending` / `completed` / `failed`).
 */
export function mapUksbsStatusToPaymentStatus(uksbsStatus: string): string | null {
  switch (uksbsStatus.toUpperCase()) {
    case 'PAID':
    case 'SUCCESS':
    case 'COMPLETED':
      return PAYMENT_TABLE_STATUS.COMPLETED;
    case 'FAILED':
      return PAYMENT_TABLE_STATUS.FAILED;
    default:
      return null;
  }
}
