export function mapEventType(govukPayType) {
  const mapping = {
    'payment.confirmed': 'PAYMENT_CONFIRMED',
    'payment.captured': 'PAYMENT_CAPTURED',
    'payment.settled': 'PAYMENT_SETTLED',
    'payment.failed': 'PAYMENT_FAILED',
    'payment.expired': 'PAYMENT_EXPIRED',
    'payment.refunded': 'PAYMENT_REFUNDED',
  };
  return mapping[govukPayType] || 'UNKNOWN';
}
