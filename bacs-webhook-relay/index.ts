import type { Context } from 'aws-lambda';

import { envConfig } from './src/config/env.config';
import { relayService } from './src/services/relay.service';
import { createLogger, setCorrelationId } from './src/util/logger';
import { LOG_MESSAGES } from './src/constants/log.constants';
import type { RelaySummary } from './src/types';

const log = createLogger('index.ts');

const METHOD = {
  HANDLER: 'handler',
  ENSURE_ENV: 'ensureEnv',
} as const;

let envValidated = false;
function ensureEnv(): void {
  log.start(METHOD.ENSURE_ENV);
  if (!envValidated) {
    envConfig.load();
    envValidated = true;
  }
  log.end(METHOD.ENSURE_ENV);
}

export const handler = async (_event: unknown, context?: Context): Promise<RelaySummary> => {
  const correlationId = context?.awsRequestId ?? randomCorrelationId();
  setCorrelationId(correlationId);

  log.start(METHOD.HANDLER);
  log.info(METHOD.HANDLER, LOG_MESSAGES.HANDLER_INVOCATION_START, {
    functionName: context?.functionName,
    functionVersion: context?.functionVersion,
    remainingMs: context?.getRemainingTimeInMillis?.(),
  });

  try {
    ensureEnv();
    const summary = await relayService.execute();
    log.info(METHOD.HANDLER, LOG_MESSAGES.HANDLER_INVOCATION_COMPLETE, summary);
    log.end(METHOD.HANDLER);
    return summary;
  } catch (err) {
    log.error(METHOD.HANDLER, LOG_MESSAGES.HANDLER_INVOCATION_FAILED, {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    throw err;
  } finally {
    setCorrelationId(undefined);
  }
};

function randomCorrelationId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
