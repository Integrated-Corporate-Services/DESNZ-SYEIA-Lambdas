import { messageBuilderService } from '../../src/services/messageBuilder.service';
import { PoisonMessageError } from '../../src/errors/AppError';
import {
  BACS_WEBHOOK_RELAY_SCHEMA_VERSION,
  SOURCE_BACS,
} from '../../src/constants/status.constants';
import type { PaymentWebhookRow } from '../../src/types';

function row(overrides: Partial<PaymentWebhookRow> = {}): PaymentWebhookRow {
  return {
    id: 1,
    webhook_id: 'wh_123',
    payment_id: 'pay_abc',
    event_type: 'PAYMENT_STATUS_UPDATE',
    status: 'pending',
    raw_payload: { event: { eventId: 'wh_123' }, detail: { status: 'PAID', amount: 1000 } },
    enqueued_at: null,
    created_by: 'BACS-webhook-receiver',
    updated_by: null,
    correlation_id: 'corr_1',
    created_at: '2026-06-17T10:00:00.000Z',
    updated_at: '2026-06-17T10:00:00.000Z',
    ...overrides,
  };
}

describe('MessageBuilderService.build', () => {
  it('builds an envelope with the BACS shape', () => {
    const env = messageBuilderService.build(row());
    expect(env).toEqual({
      schemaVersion: BACS_RELAY_SCHEMA_VERSION,
      source: SOURCE_BACS,
      webhookId: 'wh_123',
      paymentId: 'pay_abc',
      eventType: 'PAYMENT_STATUS_UPDATE',
      status: 'pending',
      correlationId: 'corr_1',
      receivedAt: '2026-06-17T10:00:00.000Z',
      payload: { event: { eventId: 'wh_123' }, detail: { status: 'PAID', amount: 1000 } },
    });
  });

  it('passes through BACS uppercase status untouched in the envelope', () => {
    const env = messageBuilderService.build(row({ status: 'PENDING' }));
    expect(env.status).toBe('PENDING');
  });

  it('parses raw_payload when stored as a JSON string', () => {
    const env = messageBuilderService.build(row({ raw_payload: '{"foo":"bar"}' }));
    expect(env.payload).toEqual({ foo: 'bar' });
  });

  it('throws PoisonMessageError on unparseable JSON string', () => {
    expect(() => messageBuilderService.build(row({ raw_payload: 'not-json' }))).toThrow(PoisonMessageError);
  });

  it('throws PoisonMessageError when payload is an array', () => {
    expect(() => messageBuilderService.build(row({ raw_payload: '[1,2,3]' }))).toThrow(PoisonMessageError);
  });

  it('accepts Date objects for created_at', () => {
    const env = messageBuilderService.build(row({ created_at: new Date('2026-06-17T11:00:00.000Z') }));
    expect(env.receivedAt).toBe('2026-06-17T11:00:00.000Z');
  });
});
