import {
  buildPaymentOutboxPayload,
  isApplicationOutboxEnabled,
} from '../../src/database/applicationOutboxRepository.js';
import type { Payment } from '../../src/types/index.js';

describe('applicationOutboxRepository', () => {
  const originalEnv = process.env.ENABLE_APPLICATION_OUTBOX;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_APPLICATION_OUTBOX;
    } else {
      process.env.ENABLE_APPLICATION_OUTBOX = originalEnv;
    }
  });

  test('isApplicationOutboxEnabled defaults to false', () => {
    delete process.env.ENABLE_APPLICATION_OUTBOX;
    expect(isApplicationOutboxEnabled()).toBe(false);
  });

  test('isApplicationOutboxEnabled respects true flag', () => {
    process.env.ENABLE_APPLICATION_OUTBOX = 'true';
    expect(isApplicationOutboxEnabled()).toBe(true);
  });

  test('buildPaymentOutboxPayload includes application and payment details', () => {
    const payment: Payment = {
      id: 42,
      payment_id: 'pay_123',
      application_id: 'app-uuid-1',
      amount: 10000,
      reference: 'REF-1',
      status: 'confirmed',
      description: 'Fee',
      created_at: new Date('2026-06-19T10:00:00.000Z'),
    };

    const payload = JSON.parse(
      buildPaymentOutboxPayload({
        payment,
        paymentId: 'pay_123',
        newStatus: 'confirmed',
        outboxEventType: 'PAYMENT_CONFIRMED',
        rawEventType: 'card_payment_succeeded',
        webhookId: 'evt-1',
        eventHistory: ['payment.confirmed'],
      })
    );

    expect(payload.applicationId).toBe('app-uuid-1');
    expect(payload.event_type).toBe('PAYMENT_CONFIRMED');
    expect(payload.payment.paymentId).toBe('pay_123');
    expect(payload.payment.govukEventType).toBe('card_payment_succeeded');
    expect(payload.payment.eventHistory).toEqual(['payment.confirmed']);
  });
});
