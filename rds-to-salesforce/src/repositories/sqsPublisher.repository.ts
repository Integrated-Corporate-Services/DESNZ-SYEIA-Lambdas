/**
 * SQS Publisher Repository
 * Publishes outbox events to the Salesforce events SQS queue.
 * Mirrors rds-to-salesforce-worker/src/repositories/sqs.repository.ts.
 */
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { AWS_CONFIG, getSalesforceEventsQueueUrl } from '../config/sqsConfig.js';
import type { OutboxSqsMessage, SqsPublisher } from '../types/index.js';

let _sqsClient: SQSClient | null = null;

/**
 * Get singleton SQS client
 */
function getSqsClient(): SQSClient {
  if (!_sqsClient) {
    _sqsClient = new SQSClient({ region: AWS_CONFIG.region });
  }
  return _sqsClient;
}

class SqsMessagePublisher implements SqsPublisher {
  async publish(message: OutboxSqsMessage): Promise<string> {
    const client = getSqsClient();

    const result = await client.send(
      new SendMessageCommand({
        QueueUrl: getSalesforceEventsQueueUrl(),
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          outboxId: { DataType: 'String', StringValue: String(message.outboxId) },
          applicationId: { DataType: 'String', StringValue: message.applicationId },
        },
      }),
    );

    if (!result.MessageId) {
      throw new Error('SQS SendMessageCommand returned no MessageId');
    }
    return result.MessageId;
  }
}

export const sqsPublisher: SqsPublisher = new SqsMessagePublisher();
