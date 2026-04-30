import { getPool } from './database/pool';
import log from './util/logger';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { WebhookRow, SQSEnqueueResult } from './pollUnenqueuedWebhooks.types';
import { TABLE_PAYMENT_WEBHOOKS, STATUS_PROCESSING } from './poll-unenqueued-webhooks.constants';

const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

export async function pollAndEnqueueWebhooks(): Promise<{ message: string; results: SQSEnqueueResult[] }> {
  const pool = getPool();
  const { rows } = await pool.query<WebhookRow>(
    `SELECT webhook_id, payment_id, event_type, status, raw_payload, correlation_id FROM ${TABLE_PAYMENT_WEBHOOKS} WHERE enqueued_at IS NULL AND status = $1 LIMIT 10`,
    [STATUS_PROCESSING]
  );
  if (!rows.length) {
    log.info('[service] No unenqueued webhooks found.');
    return { message: 'No unenqueued webhooks found.', results: [] };
  }
  const results: SQSEnqueueResult[] = [];
  for (const webhook of rows) {
    try {
      const messageBody = {
        webhook: JSON.parse(webhook.raw_payload),
        metadata: {
          webhookId: webhook.webhook_id,
          paymentId: webhook.payment_id,
          eventType: webhook.event_type,
          source: 'eventbridge-scheduler',
          correlationId: webhook.correlation_id,
          timestamp: new Date().toISOString(),
        },
      };
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify(messageBody),
          MessageAttributes: {
            EventType: { DataType: 'String', StringValue: webhook.event_type },
            PaymentId: { DataType: 'String', StringValue: webhook.payment_id },
            WebhookId: { DataType: 'String', StringValue: webhook.webhook_id },
          },
        })
      );
      await pool.query(
        `UPDATE ${TABLE_PAYMENT_WEBHOOKS} SET enqueued_at = NOW() WHERE webhook_id = $1`,
        [webhook.webhook_id]
      );
      log.info('[service] Webhook enqueued to SQS', { webhookId: webhook.webhook_id });
      results.push({ webhookId: webhook.webhook_id, success: true });
    } catch (err) {
      log.error('[service] Failed to enqueue webhook', {
        webhookId: webhook.webhook_id,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({ webhookId: webhook.webhook_id, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { message: `Processed ${rows.length} webhooks.`, results };
}
