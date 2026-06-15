import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SQSEnqueueResult, WebhookRow } from '../types';
import { getAwsRegion } from '../util/dbConfig';

function getSqsClient(): SQSClient {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  return new SQSClient({
    region: getAwsRegion(),
    ...(endpoint ? { endpoint } : {}),
  });
}

function getQueueUrl(): string {
  const queueUrl = process.env.SQS_QUEUE_URL || process.env.WEBHOOK_SQS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('SQS queue URL not configured');
  }

  return queueUrl;
}

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
        source: 'inbound-event-receiver',
        correlationId: webhook.correlation_id,
        timestamp: new Date().toISOString(),
      },
    };

    await getSqsClient().send(
      new SendMessageCommand({
        QueueUrl: getQueueUrl(),
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
