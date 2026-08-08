import type { Context, SQSEvent } from 'aws-lambda';

import { envConfig } from './src/config/env.config';
import { workerService } from './src/services/worker.service';
import { createLogger, setCorrelationId } from './src/util/logger';
import { LOG_MESSAGES } from './src/constants/log.constants';
import type { WorkerSummary } from './src/types';

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

export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<WorkerSummary> => {
  setCorrelationId(context.awsRequestId);
  log.start(METHOD.HANDLER, { recordCount: event.Records?.length || 0 });

  try {
    ensureEnv();

    if (!event.Records || event.Records.length === 0) {
      log.info(LOG_MESSAGES.NO_RECORDS);
      return { processed: 0, failed: 0, errors: [] };
    }

    log.debug('Processing records', { count: event.Records.length });
    const summary = await workerService.processRecords(event.Records);

    log.end(METHOD.HANDLER, {
      processed: summary.processed,
      failed: summary.failed,
      errors: summary.errors.length,
    });

    return summary;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(LOG_MESSAGES.HANDLER_ERROR, { error: errorMsg });

    return {
      processed: 0,
      failed: event.Records?.length || 0,
      errors: [{ message: errorMsg, recordId: 'handler-error' }],
    };
  }
};
