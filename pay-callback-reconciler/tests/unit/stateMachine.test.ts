import {
  normalizePaymentStatusForStateMachine,
  mapStateToDbStatus,
  deriveStatusFromEvents,
  isValidTransition,
  canTransitionToTerminal,
} from '../../src/stateManagement/stateMachine.js';

describe('stateMachine - payment table status mapping', () => {
  test('maps application created status to PENDING', () => {
    expect(normalizePaymentStatusForStateMachine('created')).toBe('PENDING');
  });

  test('maps confirmed status to CONFIRMED', () => {
    expect(normalizePaymentStatusForStateMachine('confirmed')).toBe('CONFIRMED');
  });

  test('maps internal state back to application status', () => {
    expect(mapStateToDbStatus('CONFIRMED')).toBe('confirmed');
    expect(mapStateToDbStatus('PENDING')).toBe('created');
  });

  test('derives confirmed from succeeded webhook events', () => {
    expect(deriveStatusFromEvents(['payment.confirmed'])).toBe('CONFIRMED');
  });

  test('rejects captured before confirmed transition from PENDING', () => {
    expect(isValidTransition('PENDING', 'payment.captured')).toBe(false);
    expect(canTransitionToTerminal('PENDING', 'payment.captured')).toBe(false);
  });
});
