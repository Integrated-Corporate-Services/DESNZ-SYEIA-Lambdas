import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SQSEnqueueResult, WebhookRow } from '../types';

const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

export async function enqueueWebhookToSQS(webhook: WebhookRow): Promise<SQSEnqueueResult> {
  try {
    const parsedPayload =
      typeof webhook.raw_payload === 'string'
        ? JSON.parse(webhook.raw_payload)
        : webhook.raw_payload;

    const messageBody = {
      webhook: parsedPayload,
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
    return { webhookId: webhook.webhook_id, success: true };
  } catch (err) {
    return {
      webhookId: webhook.webhook_id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
