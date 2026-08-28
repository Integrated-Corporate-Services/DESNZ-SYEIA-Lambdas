import type { SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { Pool } from 'pg';
import { workerService } from './src/services/worker.service';
import { createLogger } from './src/util/logger';
import { RetryableProcessingError } from './src/errors';
import { getDatabaseConfig, validateEnvironment, SQS_QUEUE_ARN, SQS_DLQ_ARN } from './src/config/env.config';
import type { OutboxSqsMessage } from './src/types';

const logger = createLogger('handler');

validateEnvironment();

let poolPromise: Promise<Pool> | null = null;
function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = getDatabaseConfig().then((config) => new Pool(config));
  }
  return poolPromise;
}

export const handler: SQSHandler = async (event, context) => {
  logger.info('Worker Lambda invoked', {
    awsRequestId: context.awsRequestId,
    recordCount: event.Records.length,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
  });

  const pool = await getPool();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const messageId = record.messageId;

    try {
      const message: OutboxSqsMessage = JSON.parse(record.body);

      if (record.eventSourceARN !== SQS_QUEUE_ARN && record.eventSourceARN !== SQS_DLQ_ARN) {
        logger.error('Worker: message from unrecognized event source - will retry rather than silently drop', {
          messageId,
          eventSourceARN: record.eventSourceARN,
        });
        batchItemFailures.push({ itemIdentifier: messageId });
        continue;
      }
      const isFromDlq = record.eventSourceARN === SQS_DLQ_ARN;

      logger.info('Worker: processing SQS message', {
        messageId,
        outboxId: message.outboxId,
        applicationId: message.applicationId,
        eventType: message.eventType,
        source: isFromDlq ? 'DLQ' : 'MAIN',
      });

      const result = isFromDlq
        ? await workerService.processDlqMessage(message, pool)
        : await workerService.processMessage(message, pool);

      logger.info('Worker: message processed', {
        messageId,
        outboxId: message.outboxId,
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
