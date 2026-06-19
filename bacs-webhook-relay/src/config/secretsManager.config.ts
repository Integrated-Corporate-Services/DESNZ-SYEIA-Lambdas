import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { envConfig } from './env.config';
import { withRetry } from '../util/retry';
import { AppError } from '../errors/AppError';
import { createLogger } from '../util/logger';
import { ERROR_CODES } from '../constants/error.constants';
import { LOG_MESSAGES } from '../constants/log.constants';
import { RETRY_DEFAULTS } from '../constants/defaults.constants';
import type { RdsCredentials } from '../types';

const log = createLogger('secretsManager.config.ts');

const METHOD = {
  GET_RDS_CREDENTIALS: 'getRdsCredentials',
  INVALIDATE_CACHE: 'invalidateCache',
  FETCH: 'fetch',
  GET_CLIENT: 'getClient',
} as const;

interface CachedSecret {
  credentials: RdsCredentials;
  fetchedAt: number;
}

class SecretsManagerConfig {
  private cached: CachedSecret | undefined;
  private inflight: Promise<RdsCredentials> | undefined;
  private client: SecretsManagerClient | undefined;

  async getRdsCredentials(): Promise<RdsCredentials> {
    log.start(METHOD.GET_RDS_CREDENTIALS);

    const env = envConfig.get();
    const now = Date.now();

    if (this.cached && now - this.cached.fetchedAt < env.SECRET_CACHE_TTL_MS) {
      log.end(METHOD.GET_RDS_CREDENTIALS, { source: 'cache' });
      return this.cached.credentials;
    }

    if (this.inflight) {
      const creds = await this.inflight;
      log.end(METHOD.GET_RDS_CREDENTIALS, { source: 'inflight' });
      return creds;
    }

    this.inflight = this.fetch().finally(() => {
      this.inflight = undefined;
    });

    const credentials = await this.inflight;
    log.end(METHOD.GET_RDS_CREDENTIALS, { source: 'secrets-manager' });
    return credentials;
  }

  invalidateCache(): void {
    log.start(METHOD.INVALIDATE_CACHE);
    log.warn(METHOD.INVALIDATE_CACHE, LOG_MESSAGES.SECRET_CACHE_INVALIDATED);
    this.cached = undefined;
    log.end(METHOD.INVALIDATE_CACHE);
  }

  private async fetch(): Promise<RdsCredentials> {
    log.start(METHOD.FETCH);

    const env = envConfig.get();
    const c = this.getClient();

    const result = await withRetry(
      async () => c.send(new GetSecretValueCommand({ SecretId: env.DB_SECRET_ARN })),
      {
        attempts: RETRY_DEFAULTS.ATTEMPTS,
        baseDelayMs: RETRY_DEFAULTS.BASE_DELAY_MS,
        maxDelayMs: RETRY_DEFAULTS.MAX_DELAY_MS,
        label: 'secrets-manager:GetSecretValue',
      },
    );

    if (!result.SecretString) {
      throw new AppError(ERROR_CODES.SECRET_EMPTY, LOG_MESSAGES.SECRET_EMPTY_STRING, {
        retryable: false,
        meta: { secretArn: env.DB_SECRET_ARN },
      });
    }

    let parsed: { username?: string; password?: string };
    try {
      parsed = JSON.parse(result.SecretString);
    } catch (cause) {
      throw new AppError(ERROR_CODES.SECRET_PARSE_FAILED, LOG_MESSAGES.SECRET_PARSE_FAILED, {
        retryable: false,
        cause,
      });
    }

    if (!parsed.username || !parsed.password) {
      throw new AppError(ERROR_CODES.SECRET_SHAPE_INVALID, LOG_MESSAGES.SECRET_SHAPE_INVALID, {
        retryable: false,
      });
    }

    const credentials: RdsCredentials = {
      username: parsed.username,
      password: parsed.password,
      rotationVersionId: result.VersionId,
      fetchedAt: Date.now(),
    };

    this.cached = { credentials, fetchedAt: credentials.fetchedAt };

    log.info(METHOD.FETCH, LOG_MESSAGES.SECRET_LOADED, {
      secretArn: env.DB_SECRET_ARN,
      versionId: result.VersionId,
      usernameSample: parsed.username.slice(0, 3) + '***',
    });
    log.end(METHOD.FETCH);
    return credentials;
  }

  private getClient(): SecretsManagerClient {
    log.start(METHOD.GET_CLIENT);
    if (!this.client) {
      const env = envConfig.get();
      this.client = new SecretsManagerClient({
        region: env.AWS_REGION,
        ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
      });
    }
    log.end(METHOD.GET_CLIENT);
    return this.client;
  }

  
  resetForTest(): void {
    this.cached = undefined;
    this.inflight = undefined;
    this.client = undefined;
  }
}

export const secretsManagerConfig = new SecretsManagerConfig();
