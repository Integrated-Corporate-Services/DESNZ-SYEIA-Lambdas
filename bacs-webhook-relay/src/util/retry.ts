import { createLogger } from './logger';
import { LOG_MESSAGES } from '../constants/log.constants';

const log = createLogger('retry.ts');

const METHOD = {
  WITH_RETRY: 'withRetry',
} as const;

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  label?: string;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  log.start(METHOD.WITH_RETRY, { label: opts.label, attempts: opts.attempts });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      const result = await fn();
      log.end(METHOD.WITH_RETRY, { label: opts.label, attempt, outcome: 'success' });
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = opts.shouldRetry ? opts.shouldRetry(err, attempt) : true;
      if (!retryable || attempt === opts.attempts) break;

      const expBackoff = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.floor(expBackoff / 4));
      const delayMs = expBackoff + jitter;

      log.warn(METHOD.WITH_RETRY, LOG_MESSAGES.RETRY_ATTEMPT_FAILED, {
        label: opts.label,
        attempt,
        delayMs,
        error: err instanceof Error ? err.message : String(err),
      });

      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
