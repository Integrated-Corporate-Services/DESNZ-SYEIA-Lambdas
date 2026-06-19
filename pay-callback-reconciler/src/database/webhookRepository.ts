import { query } from '../util/database.js';
import { webhookQueries } from '../queries/webhookQueries.js';
import { WEBHOOK_STATUS } from '../constants/webhook.constants.js';

export async function markWebhookProcessed(webhookId: string): Promise<void> {
  await query(webhookQueries.markProcessed, [WEBHOOK_STATUS.PROCESSED, webhookId]);
}

export async function markWebhookFailed(webhookId: string): Promise<void> {
  await query(webhookQueries.markFailed, [WEBHOOK_STATUS.FAILED, webhookId]);
}
