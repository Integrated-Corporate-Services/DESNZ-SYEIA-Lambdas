import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

import { envConfig } from './env.config';
import { withRetry } from '../util/retry';
import { AppError } from '../errors/AppError';
import { createLogger } from '../util/logger';
import { ERROR_CODES } from '../constants/error.constants';
import { LOG_MESSAGES } from '../constants/log.constants';
import { RETRY_DEFAULTS } from '../constants/defaults.constants';

const log = createLogger('ssm.config.ts');

const METHOD = {
  GET_PARAMETER: 'getParameter',
  INVALIDATE_CACHE: 'invalidateCache',
  GET_CLIENT: 'getClient',
} as const;

interface CachedParam {
  value: string;
  fetchedAt: number;
}

class SsmConfig {
  private cache = new Map<string, CachedParam>();
  private client: SSMClient | undefined;

  async getParameter(
    name: string,
    opts: { withDecryption?: boolean } = {},
  ): Promise<string> {
    log.start(METHOD.GET_PARAMETER, { name });

    const env = envConfig.get();
    const now = Date.now();
    const hit = this.cache.get(name);
    if (hit && now - hit.fetchedAt < env.SSM_CACHE_TTL_MS) {
      log.end(METHOD.GET_PARAMETER, { name, source: 'cache' });
      return hit.value;
    }

    const value = await withRetry(
      async () => {
        const result = await this.getClient().send(
          new GetParameterCommand({
            Name: name,
            WithDecryption: opts.withDecryption ?? true,
          }),
        );
        if (!result.Parameter?.Value) {
          throw new AppError(ERROR_CODES.SSM_EMPTY, LOG_MESSAGES.SSM_PARAMETER_EMPTY, {
            retryable: false,
            meta: { name },
          });
        }
        return result.Parameter.Value;
      },
      {
        attempts: RETRY_DEFAULTS.ATTEMPTS,
        baseDelayMs: RETRY_DEFAULTS.BASE_DELAY_MS,
        maxDelayMs: RETRY_DEFAULTS.MAX_DELAY_MS,
        label: `ssm:GetParameter:${name}`,
      },
    );

    this.cache.set(name, { value, fetchedAt: now });
    log.debug(METHOD.GET_PARAMETER, LOG_MESSAGES.SSM_PARAMETER_LOADED, { name });
    log.end(METHOD.GET_PARAMETER, { name, source: 'ssm' });
    return value;
  }

  invalidateCache(name?: string): void {
    log.start(METHOD.INVALIDATE_CACHE, { name: name ?? '*' });
    if (name) this.cache.delete(name);
    else this.cache.clear();
    log.end(METHOD.INVALIDATE_CACHE);
  }

  private getClient(): SSMClient {
    log.start(METHOD.GET_CLIENT);
    if (!this.client) {
      const env = envConfig.get();
      this.client = new SSMClient({
        region: env.AWS_REGION,
        ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
      });
    }
    log.end(METHOD.GET_CLIENT);
    return this.client;
  }

  
  resetForTest(): void {
    this.cache.clear();
    this.client = undefined;
  }
}

export const ssmConfig = new SsmConfig();
