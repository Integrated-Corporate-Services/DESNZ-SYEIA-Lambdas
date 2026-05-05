import log from '../util/logger';
import { getUnenqueuedWebhooks, markWebhookEnqueued } from '../repositories/webhookRepository';
import { enqueueWebhookToSQS } from './sqsService';
import type { SQSEnqueueResult } from '../types';

export async function pollAndEnqueueWebhooks(): Promise<{ message: string; results: SQSEnqueueResult[] }> {
  const webhooks = await getUnenqueuedWebhooks();
  if (!webhooks.length) {
    log.info('[service] No unenqueued webhooks found.');
    return { message: 'No unenqueued webhooks found.', results: [] };
  }
  const results: SQSEnqueueResult[] = [];
  for (const webhook of webhooks) {
    const result = await enqueueWebhookToSQS(webhook);
    if (result.success) {
      await markWebhookEnqueued(webhook.webhook_id);
      log.info('[service] Webhook enqueued to SQS', { webhookId: webhook.webhook_id });
    } else {
      log.error('[service] Failed to enqueue webhook', {
        webhookId: webhook.webhook_id,
        error: result.error,
      });
    }
    results.push(result);
  }
  return { message: `Processed ${webhooks.length} webhooks.`, results };
}
