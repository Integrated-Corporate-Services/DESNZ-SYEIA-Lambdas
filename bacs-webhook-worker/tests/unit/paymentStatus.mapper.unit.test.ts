import { mapUksbsStatusToPaymentStatus, PAYMENT_TABLE_STATUS } from '../../src/util/paymentStatus.mapper';

describe('mapUksbsStatusToPaymentStatus', () => {
  test.each([
    ['PAID', PAYMENT_TABLE_STATUS.COMPLETED],
    ['paid', PAYMENT_TABLE_STATUS.COMPLETED],
    ['SUCCESS', PAYMENT_TABLE_STATUS.COMPLETED],
    ['COMPLETED', PAYMENT_TABLE_STATUS.COMPLETED],
    ['FAILED', PAYMENT_TABLE_STATUS.FAILED],
    ['failed', PAYMENT_TABLE_STATUS.FAILED],
  ])('maps %s', (input, expected) => {
    expect(mapUksbsStatusToPaymentStatus(input)).toBe(expected);
  });

  test('returns null for an unrecognised status', () => {
    expect(mapUksbsStatusToPaymentStatus('PENDING')).toBeNull();
  });
});
