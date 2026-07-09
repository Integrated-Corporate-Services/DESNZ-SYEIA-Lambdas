import type { SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { Pool } from 'pg';
import { workerService } from './src/services/worker.service';
import { createLogger } from './src/util/logger';
import { RetryableProcessingError } from './src/errors';
import { DATABASE_CONFIG, validateEnvironment } from './src/config/env.config';
import type { RdsSalesforceMessage } from './src/types';

const logger = createLogger('handler');

// Create PostgreSQL pool
const pool = new Pool(DATABASE_CONFIG);

// Validate environment on cold start
validateEnvironment();

/**
 * SQS Lambda handler with ReportBatchItemFailures
 * Triggered by rds-salesforce-queue
 * Batch size: 10 messages
 */
export const handler: SQSHandler = async (event, context) => {
  logger.info('Worker Lambda invoked', {
    awsRequestId: context.awsRequestId,
    recordCount: event.Records.length,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
  });

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      // Parse SQS message
      const message: RdsSalesforceMessage = JSON.parse(record.body);

      logger.info('Worker: processing SQS message', {
        messageId,
        eventId: message.eventId,
        recordId: message.recordId,
        tableName: message.tableName,
        operation: message.operation,
      });

      // Process the event
      const result = await workerService.processEvent(message, pool);

      logger.info('Worker: message processed', {
        messageId,
        eventId: message.eventId,
        outcome: result.outcome,
      });
    } catch (error) {
      // If retryable, add to batch failures so SQS redelivers
      if (error instanceof RetryableProcessingError) {
        logger.warn('Worker: message will be retried', {
          messageId,
          error: error.message,
        });

        batchItemFailures.push({ itemIdentifier: messageId });
      } else {
        // Non-retryable error - already marked as fatal in processEvent
        logger.error('Worker: message failed (non-retryable)', {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Drain pool at end of Lambda execution
  try {
    await pool.end();
  } catch (error) {
    logger.warn('Worker: error draining pool', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('Worker Lambda complete', {
    awsRequestId: context.awsRequestId,
    totalRecords: event.Records.length,
    failedRecords: batchItemFailures.length,
  });

  // Return batch item failures for SQS partial batch response
  const response: SQSBatchResponse = {
    batchItemFailures,
  };

  return response;
};
