/**
 * Lambda: pollUnenqueuedWebhooks
 * Scheduled by EventBridge (every 15 seconds)
 * - Selects webhook records where enqueued_at IS NULL
 * - Sends each to SQS for payment processing
 * - Updates enqueued_at timestamp
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Pool } from 'pg';

const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

export const handler = async () => {
  // 1. Select unenqueued webhooks
  const { rows } = await pool.query(
    `SELECT * FROM payment_webhooks WHERE enqueued_at IS NULL AND status = 'processing' LIMIT 10`
  );
  if (!rows.length) return { message: 'No unenqueued webhooks found.' };

  for (const webhook of rows) {
    // 2. Send to SQS
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
    // 3. Update enqueued_at
    await pool.query(
      `UPDATE payment_webhooks SET enqueued_at = NOW() WHERE webhook_id = $1`,
      [webhook.webhook_id]
    );
  }
  return { message: `Enqueued ${rows.length} webhooks.` };
};
