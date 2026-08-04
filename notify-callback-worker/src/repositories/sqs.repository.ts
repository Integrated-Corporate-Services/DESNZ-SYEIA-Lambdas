import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { FatalSqsMessage } from '../types';
import { AWS_CONFIG, getFatalQueueUrl } from '../config/env.config';
import { createLogger } from '../util/logger';

const logger = createLogger('sqs.repository');

let _sqsClient: SQSClient | null = null;

/**
 * Get singleton SQS client
 */
function getSqsClient(): SQSClient {
  if (!_sqsClient) {
    _sqsClient = new SQSClient({
      region: AWS_CONFIG.region,
      endpoint: AWS_CONFIG.endpoint,
      credentials: AWS_CONFIG.endpoint
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
          }
        : undefined,
    });
    logger.info('SQS client initialized', {
      region: AWS_CONFIG.region,
      endpoint: AWS_CONFIG.endpoint || 'default',
    });
  }
  return _sqsClient;
}

/**
 * SQS Repository
 * Handles fatal message publishing
 */
class SqsRepository {
  /**
   * Publish fatal message to DLQ
   */
  async publishFatalMessage(msg: FatalSqsMessage): Promise<void> {
    const fatalQueueUrl = getFatalQueueUrl();
    if (!fatalQueueUrl) {
      throw new Error(
        'FATAL_QUEUE_URL not configured (NOTIFY_FATAL_QUEUE_URL or SQS_DLQ_URL)',
      );
    }

    const client = getSqsClient();

    await client.send(
      new SendMessageCommand({
        QueueUrl: fatalQueueUrl,
        MessageBody: JSON.stringify(msg),
        MessageAttributes: {
          eventId: {
            DataType: 'String',
            StringValue: msg.eventId,
          },
          reason: {
            DataType: 'String',
            StringValue: msg.reason,
          },
        },
      }),
    );

    logger.debug('Published fatal message', {
      eventId: msg.eventId,
      reason: msg.reason,
    });
  }
}

export const sqsRepository = new SqsRepository();
