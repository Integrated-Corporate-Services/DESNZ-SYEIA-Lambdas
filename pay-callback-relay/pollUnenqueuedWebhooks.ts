/**
 * Lambda: pollUnenqueuedWebhooks
 * Scheduled by EventBridge (every 15 seconds)
 * - Selects webhook records where enqueued_at IS NULL
 * - Sends each to SQS for payment processing
 * - Updates enqueued_at timestamp
 */

import { validateEnvVars } from './util/env';
import log from './util/logger';
import { pollAndEnqueueWebhooks } from './poll-unenqueued-webhooks.constants';

let envValidated = false;
function ensureEnvValidation() {
  if (!envValidated) {
    validateEnvVars();
    envValidated = true;
  }
}

export const handler = async (event?: any, context?: any) => {
  try {
    ensureEnvValidation();
    const result = await pollAndEnqueueWebhooks();
    log.info('[handler] Polling and enqueue complete', { result });
    return result;
  } catch (error) {
    log.error('[handler] Lambda failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
