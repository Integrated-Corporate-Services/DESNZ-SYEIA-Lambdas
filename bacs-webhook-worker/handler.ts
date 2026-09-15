import type { Context, SQSEvent, SQSBatchResponse } from 'aws-lambda';

import { envConfig } from './src/config/env.config';
import { workerService } from './src/services/worker.service';
import { createLogger, setCorrelationId } from './src/util/logger';
import { LOG_MESSAGES, LOG_CHILD_DOMAIN, LOG_EVENTS } from './src/constants/log.constants';

const log = createLogger('handler.ts', LOG_CHILD_DOMAIN.HANDLER);

const METHOD = {
  HANDLER: 'handler',
  ENSURE_ENV: 'ensureEnv',
} as const;

let envValidated = false;
async function ensureEnv(): Promise<void> {
  log.start(METHOD.ENSURE_ENV);
  if (!envValidated) {
    await envConfig.load();
    envValidated = true;
  }
  log.end(METHOD.ENSURE_ENV);
}

export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<SQSBatchResponse> => {
  setCorrelationId(context.awsRequestId);
  log.start(METHOD.HANDLER);
  log.info(METHOD.HANDLER, LOG_MESSAGES.HANDLER_INVOCATION_START, {
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    remainingMs: context.getRemainingTimeInMillis?.(),
    recordCount: event.Records?.length || 0,
  });

  try {
    await ensureEnv();

    if (!event.Records || event.Records.length === 0) {
      log.info(METHOD.HANDLER, LOG_MESSAGES.NO_RECORDS);
      const empty: SQSBatchResponse = { batchItemFailures: [] };
      log.end(METHOD.HANDLER, { processed: 0, failed: 0, errors: 0 });
      return empty;
    }

    log.info(METHOD.HANDLER, LOG_MESSAGES.SQS_RECORDS_RECEIVED, {
      totalRecords: event.Records.length,
      messageIds: event.Records.map((r) => r.messageId),
    });

    const summary = await workerService.processRecords(event.Records);

    log.info(METHOD.HANDLER, LOG_MESSAGES.HANDLER_INVOCATION_COMPLETE, {
      processed: summary.processed,
      failed: summary.failed,
      errors: summary.errors.length,
    });
    log.end(METHOD.HANDLER, {
      processed: summary.processed,
      failed: summary.failed,
      errors: summary.errors.length,
    });

    return {
      batchItemFailures: summary.errors
        .filter((e) => e.recordId)
        .map((e) => ({ itemIdentifier: e.recordId })),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(METHOD.HANDLER, LOG_MESSAGES.HANDLER_INVOCATION_FAILED, {
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    }, LOG_EVENTS.INVOCATION_FAILED);

    return {
      batchItemFailures: (event.Records || []).map((r) => ({ itemIdentifier: r.messageId })),
    };
  } finally {
    setCorrelationId(undefined);
  }
};

