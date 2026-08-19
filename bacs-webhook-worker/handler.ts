import type { SQSHandler, SQSBatchResponse } from 'aws-lambda';

import { envConfig } from './src/config/env.config';
import { workerService } from './src/services/worker.service';
import { createLogger, setCorrelationId } from './src/util/logger';
import { LOG_MESSAGES } from './src/constants/log.constants';

const log = createLogger('handler.ts');

const METHOD = {
  HANDLER: 'handler',
  ENSURE_ENV: 'ensureEnv',
} as const;

let envValidated = false;
function ensureEnv(): void {
  if (!envValidated) {
    envConfig.load();
    envValidated = true;
  }
}

/**
 * SQS Lambda handler with ReportBatchItemFailures
 * Triggered by BACS webhook queue
 * Processes BACS payment notifications
 */
export const handler: SQSHandler = async (event, context): Promise<SQSBatchResponse> => {
  context.callbackWaitsForEmptyEventLoop = false;
  setCorrelationId(context.awsRequestId);

  log.info('BACS Worker Lambda invoked', {
    awsRequestId: context.awsRequestId,
    recordCount: event.Records.length,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
  });

  try {
    ensureEnv();

    if (!event.Records || event.Records.length === 0) {
      log.info(LOG_MESSAGES.NO_RECORDS);
      return { batchItemFailures: [] };
    }

    const batchItemFailures = await workerService.processRecords(event.Records);

    log.info('BACS Worker Lambda complete', {
      awsRequestId: context.awsRequestId,
      totalRecords: event.Records.length,
      failedRecords: batchItemFailures.length,
    });

    return { batchItemFailures };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(LOG_MESSAGES.HANDLER_ERROR, { error: errorMsg });

    // Critical handler error - fail all messages for retry
    return {
      batchItemFailures: event.Records.map((r) => ({ itemIdentifier: r.messageId })),
    };
  }
};
