import { mapUksbsStatusToPaymentStatus } from '../../src/util/paymentStatus.mapper';

describe('mapUksbsStatusToPaymentStatus', () => {
  test.each([
    ['PAID', 'PAID'],
    ['paid', 'paid'],
    ['SUCCESS', 'SUCCESS'],
    ['COMPLETED', 'COMPLETED'],
    ['FAILED', 'FAILED'],
    ['failed', 'failed'],
  ])('passes %s through verbatim', (input, expected) => {
    expect(mapUksbsStatusToPaymentStatus(input)).toBe(expected);
  });

  test('returns null for an unrecognised status', () => {
    expect(mapUksbsStatusToPaymentStatus('PENDING')).toBeNull();
  });
});
