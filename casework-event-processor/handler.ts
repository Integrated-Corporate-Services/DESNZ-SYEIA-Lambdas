import type { SQSHandler, SQSBatchResponse } from 'aws-lambda';
import { createLogger } from './src/util/logger';
import { getPool, validateEnvironment } from './src/config/env.config';
import { getParserConfig } from './src/config/parser-config';
import { markInboxProcessed, registerInboxEvent } from './src/repositories/integration-inbox.repository';
import { routeEvent } from './src/routing/event.router';
import { parseSqsMessage } from './src/validation/event-parser';
import type { Pool } from 'pg';

const logger = createLogger('handler');

export const handler: SQSHandler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  let pool: Pool;
  try {
    validateEnvironment();
    pool = await getPool();
  } catch (error) {
    logger.error('Lambda setup failed; records marked for retry', {
      awsRequestId: context.awsRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      batchItemFailures: event.Records.map((record) => ({ itemIdentifier: record.messageId })),
    };
  }

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
      await processRecord(pool, record.body);
    } catch (error) {
      logger.error('Record failed and marked for retry', {
        messageId,
        errorCode: error instanceof Error && 'code' in error ? error.code : error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      batchItemFailures.push({ itemIdentifier: messageId });
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

async function processRecord(pool: Pool, body: string): Promise<void> {
  const parsedEvent = parseSqsMessage(body, getParserConfig());
  const startedAt = Date.now();
  const context = {
    sourceEventId: parsedEvent.sourceEventId,
    eventType: parsedEvent.eventType,
    applicationId: parsedEvent.applicationId,
    applicationType: parsedEvent.applicationType,
    correlationId: parsedEvent.correlationId,
    caseId: parsedEvent.caseId,
  };
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const registered = await registerInboxEvent(client, parsedEvent);
    if (!registered) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      logger.info('Duplicate event acknowledged', {
        ...context,
        processingResult: 'DUPLICATE',
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    await routeEvent(client, parsedEvent);
    await markInboxProcessed(client, parsedEvent.sourceEventId);
    await client.query('COMMIT');
    transactionStarted = false;
    logger.info('Event processed', {
      ...context,
      processingResult: 'SUCCESS',
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Transaction rollback failed', {
          ...context,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
    }
    logger.error('Retryable event failure', {
      ...context,
      processingResult: 'RETRYABLE_FAILURE',
      errorCode: error instanceof Error && 'code' in error ? error.code : error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      durationMs: Date.now() - startedAt,
    });
    throw error;
  } finally {
    client.release();
  }
}
