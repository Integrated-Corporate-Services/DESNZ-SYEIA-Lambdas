import type { GovUKPayWebhook, WebhookMetadata } from '../types/index.js';

/**
 * GOV.UK Pay webhooks use created_date; relay metadata may include timestamp.
 */
export function resolveWebhookEventTimestamp(
  webhook: GovUKPayWebhook,
  metadata?: WebhookMetadata
): string {
  return (
    webhook.created_date ||
    webhook.timestamp ||
    metadata?.timestamp ||
    new Date().toISOString()
  );
}

/**
 * Event payload stored in payment_events.event_data.
 */
export function resolveWebhookEventData(webhook: GovUKPayWebhook): unknown {
  return webhook.resource ?? webhook;
}
