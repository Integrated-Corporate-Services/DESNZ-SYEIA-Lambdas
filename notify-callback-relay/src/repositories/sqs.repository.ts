import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { NotifySqsMessage } from '../types';
import { AWS_CONFIG, QUEUE_URL } from '../config/env.config';
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
 * Handles SQS operations for notify callback messages
 */
class SqsRepository {
  /**
   * Publish notify callback message to SQS
   */
  async publishNotifyMessage(msg: NotifySqsMessage): Promise<void> {
    const client = getSqsClient();

    await client.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(msg),
        MessageAttributes: {
          notifyNotificationId: {
            DataType: 'String',
            StringValue: msg.notifyNotificationId,
          },
          status: {
            DataType: 'String',
            StringValue: msg.status,
          },
        },
      }),
    );

    logger.debug('Published SQS message', {
      eventId: msg.eventId,
      notifyNotificationId: msg.notifyNotificationId,
    });
  }
}

export const sqsRepository = new SqsRepository();
