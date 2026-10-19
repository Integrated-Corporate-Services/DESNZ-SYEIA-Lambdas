import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { AWS_CONFIG, getSalesforceEventsQueueUrl } from '../config/sqsConfig.js';
import log from '../../util/logger.js';
import type { OutboxSqsMessage, SqsMessageAttributes, SqsPublisher } from '../types/index.js';

let _sqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient {
  if (!_sqsClient) {
    _sqsClient = new SQSClient({ region: AWS_CONFIG.region });
  }
  return _sqsClient;
}

class SqsMessagePublisher implements SqsPublisher {
  async publish(message: OutboxSqsMessage, attributes: SqsMessageAttributes): Promise<string> {
    const client = getSqsClient();
    log.info(`[SQS_DELIVERY][REPOSITORY][SEND_MESSAGE][START] - sending message eventType=${message.eventType} - outboxId=${message.outboxId}`);

    const result = await client.send(
      new SendMessageCommand({
        QueueUrl: getSalesforceEventsQueueUrl(),
        MessageBody: JSON.stringify(message),
        MessageAttributes: attributes,
      }),
    );

    if (!result.MessageId) {
      log.error(`[SQS_DELIVERY][REPOSITORY][SEND_MESSAGE][FAILED] - SQS returned no MessageId - outboxId=${message.outboxId}`);
      throw new Error('SQS SendMessageCommand returned no MessageId');
    }
    log.info(`[SQS_DELIVERY][REPOSITORY][SEND_MESSAGE][END] - message sent messageId=${result.MessageId} - outboxId=${message.outboxId}`);
    return result.MessageId;
  }
}

export const sqsPublisher: SqsPublisher = new SqsMessagePublisher();
