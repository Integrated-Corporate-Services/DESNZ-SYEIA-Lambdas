import {
  resolveWebhookEventData,
  resolveWebhookEventTimestamp,
} from '../../src/util/webhookPayload.js';
import type { GovUKPayWebhook, WebhookMetadata } from '../../src/types/index.js';

describe('webhookPayload', () => {
  test('resolveWebhookEventTimestamp prefers GOV.UK Pay created_date', () => {
    const webhook: GovUKPayWebhook = {
      event_type: 'card_payment_succeeded',
      created_date: '2026-06-19T10:00:00.000Z',
    };
    const metadata: WebhookMetadata = {
      webhookId: 'w1',
      paymentId: 'pay_1',
      eventType: 'card_payment_succeeded',
      source: 'inbound-event-receiver',
      timestamp: '2026-06-19T11:00:00.000Z',
    };

    expect(resolveWebhookEventTimestamp(webhook, metadata)).toBe('2026-06-19T10:00:00.000Z');
  });

  test('resolveWebhookEventData uses resource payload', () => {
    const resource = { payment_id: 'pay_1', amount: 5000 };
    const webhook: GovUKPayWebhook = {
      event_type: 'card_payment_succeeded',
      resource,
    };

    expect(resolveWebhookEventData(webhook)).toEqual(resource);
  });
});
