import type { SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { Pool } from 'pg';
import { workerService } from './src/services/worker.service';
import { createLogger } from './src/util/logger';
import { RetryableProcessingError } from './src/errors';
import {
  resolveConnectionString,
  shouldUseDbSsl,
  validateEnvironment,
} from './src/config/env.config';
import type { NotifySqsMessage } from './src/types';

const logger = createLogger('handler');

/**
 * SQS Lambda handler with ReportBatchItemFailures
 * Triggered by notify-callbacks-queue
 * Batch size: 10 messages
 */
export const handler: SQSHandler = async (event, context) => {
  validateEnvironment();

  const pool = new Pool({
    connectionString: await resolveConnectionString(),
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: shouldUseDbSsl() ? { rejectUnauthorized: false } : undefined,
  });

  logger.info('Worker Lambda invoked', {
    awsRequestId: context.awsRequestId,
    recordCount: event.Records.length,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
  });

  const batchItemFailures: { itemIdentifier: string }[] = [];

  try {
    for (const record of event.Records) {
      const messageId = record.messageId;

      try {
        const message: NotifySqsMessage = JSON.parse(record.body);

        logger.info('Worker: processing SQS message', {
          messageId,
          eventId: message.eventId,
          notifyNotificationId: message.notifyNotificationId,
          status: message.status,
        });

        const result = await workerService.processEvent(
          message.eventId,
          message.correlationId,
          pool,
        );

        logger.info('Worker: message processed', {
          messageId,
          eventId: message.eventId,
          outcome: result.outcome,
        });
      } catch (error) {
        if (error instanceof RetryableProcessingError) {
          logger.warn('Worker: message will be retried', {
            messageId,
            error: error.message,
          });

          batchItemFailures.push({ itemIdentifier: messageId });
        } else {
          logger.error('Worker: message failed (non-retryable)', {
            messageId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } finally {
    try {
      await pool.end();
    } catch (error) {
      logger.warn('Worker: error draining pool', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Worker Lambda complete', {
    awsRequestId: context.awsRequestId,
    totalRecords: event.Records.length,
    failedRecords: batchItemFailures.length,
  });

  const response: SQSBatchResponse = {
    batchItemFailures,
  };

  return response;
};
