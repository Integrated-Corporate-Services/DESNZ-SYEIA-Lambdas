import { createLogger } from '../util/logger';
import { CACHE_TTL_DEFAULTS } from '../constants/defaults.constants';
import { DB_DEFAULTS } from '../constants/database.constants';
import { LOG_MESSAGES } from '../constants/log.constants';

const log = createLogger('env.config.ts');

const METHOD = {
  LOAD: 'load',
  GET: 'get',
} as const;

const REQUIRED = [
  'AWS_REGION',
  'DB_SECRET_ARN',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'BACS_WEBHOOK_RELAY_BATCH_SIZE_PARAM',
  'PARTNER_WEBHOOKS_QUEUE_URL',
  'PARTNER_WEBHOOKS_DLQ_URL',
] as const;

export interface Env {
  AWS_REGION: string;
  DB_SECRET_ARN: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_SSL: boolean;
  DB_STATEMENT_TIMEOUT_MS: number;
  DB_CONNECTION_TIMEOUT_MS: number;
  DB_POOL_MAX: number;
  SECRET_CACHE_TTL_MS: number;
  SSM_CACHE_TTL_MS: number;
  BACS_WEBHOOK_RELAY_BATCH_SIZE_PARAM: string;
  PARTNER_WEBHOOKS_QUEUE_URL: string;
  PARTNER_WEBHOOKS_DLQ_URL: string;
  AWS_ENDPOINT_URL: string | undefined;
}

class EnvConfig {
  private cached: Readonly<Env> | undefined;

  load(): Readonly<Env> {
    log.start(METHOD.LOAD);

    if (this.cached) {
      log.end(METHOD.LOAD, { source: 'cache' });
      return this.cached;
    }

    const missing = REQUIRED.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      log.error(METHOD.LOAD, LOG_MESSAGES.ENV_MISSING, { missing });
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    const env: Env = {
      AWS_REGION: process.env.AWS_REGION!,
      DB_SECRET_ARN: process.env.DB_SECRET_ARN!,
      DB_HOST: process.env.DB_HOST!,
      DB_PORT: Number(process.env.DB_PORT),
      DB_NAME: process.env.DB_NAME!,
      DB_SSL: process.env.DB_SSL !== 'false',
      DB_STATEMENT_TIMEOUT_MS: Number(process.env.DB_STATEMENT_TIMEOUT_MS || DB_DEFAULTS.STATEMENT_TIMEOUT_MS),
      DB_CONNECTION_TIMEOUT_MS: Number(process.env.DB_CONNECTION_TIMEOUT_MS || DB_DEFAULTS.CONNECTION_TIMEOUT_MS),
      DB_POOL_MAX: Number(process.env.DB_POOL_MAX || DB_DEFAULTS.POOL_MAX),
      SECRET_CACHE_TTL_MS: Number(process.env.SECRET_CACHE_TTL_MS || CACHE_TTL_DEFAULTS.SECRET_MS),
      SSM_CACHE_TTL_MS: Number(process.env.SSM_CACHE_TTL_MS || CACHE_TTL_DEFAULTS.SSM_MS),
      BACS_WEBHOOK_RELAY_BATCH_SIZE_PARAM: process.env.BACS_WEBHOOK_RELAY_BATCH_SIZE_PARAM!,
      PARTNER_WEBHOOKS_QUEUE_URL: process.env.PARTNER_WEBHOOKS_QUEUE_URL!,
      PARTNER_WEBHOOKS_DLQ_URL: process.env.PARTNER_WEBHOOKS_DLQ_URL!,
      AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
    };

    this.cached = Object.freeze(env);

    log.info(METHOD.LOAD, LOG_MESSAGES.ENV_LOADED, {
      region: env.AWS_REGION,
      dbHost: env.DB_HOST,
      dbName: env.DB_NAME,
      dbSsl: env.DB_SSL,
    });
    log.end(METHOD.LOAD);
    return this.cached;
  }

  get(): Readonly<Env> {
    log.start(METHOD.GET);
    const env = this.cached ?? this.load();
    log.end(METHOD.GET);
    return env;
  }

  
  resetForTest(): void {
    this.cached = undefined;
  }
}

export const envConfig = new EnvConfig();