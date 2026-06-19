import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { envConfig } from './env.config';
import { secretsManagerConfig } from './secretsManager.config';
import { DatabaseAuthError } from '../errors/AppError';
import { POSTGRES_INVALID_AUTH_CODES } from '../constants/database.constants';
import { LOG_MESSAGES } from '../constants/log.constants';
import { createLogger } from '../util/logger';

const log = createLogger('databasePool.config.ts');

const METHOD = {
  QUERY: 'query',
  WITH_TRANSACTION: 'withTransaction',
  GET_POOL: 'getPool',
  BUILD_POOL: 'buildPool',
  REBUILD_AFTER_AUTH_FAILURE: 'rebuildAfterAuthFailure',
  END: 'end',
  IS_AUTH_ERROR: 'isPostgresAuthError',
} as const;

class DatabasePoolConfig {
  private pool: Pool | undefined;
  private credentialFetchedAt: number | undefined;

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<QueryResult<R>> {
    log.start(METHOD.QUERY);

    try {
      const p = await this.getPool();
      const result = await p.query<R>(text, params as unknown[] | undefined);
      log.end(METHOD.QUERY);
      return result;
    } catch (err) {
      const { auth, pgCode } = this.isPostgresAuthError(err);
      if (!auth) throw err;

      log.warn(METHOD.QUERY, LOG_MESSAGES.DB_AUTH_ERROR_DETECTED, { pgCode });

      await this.rebuildAfterAuthFailure();

      try {
        const p = await this.getPool();
        const retried = await p.query<R>(text, params as unknown[] | undefined);
        log.end(METHOD.QUERY, { retriedAfterAuthFailure: true });
        return retried;
      } catch (retryErr) {
        throw new DatabaseAuthError(LOG_MESSAGES.DB_AUTH_FAILED_AFTER_REFRESH, {
          cause: retryErr,
          pgCode: this.isPostgresAuthError(retryErr).pgCode,
        });
      }
    }
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    log.start(METHOD.WITH_TRANSACTION);

    const p = await this.getPool();
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      log.end(METHOD.WITH_TRANSACTION, { outcome: 'committed' });
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {  }
      throw err;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    log.start(METHOD.END);
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
      this.credentialFetchedAt = undefined;
    }
    log.end(METHOD.END);
  }

  getCredentialFetchedAt(): number | undefined {
    return this.credentialFetchedAt;
  }

  private async getPool(): Promise<Pool> {
    log.start(METHOD.GET_POOL);
    if (!this.pool) this.pool = await this.buildPool();
    log.end(METHOD.GET_POOL);
    return this.pool;
  }

  private async buildPool(): Promise<Pool> {
    log.start(METHOD.BUILD_POOL);

    const env = envConfig.get();
    const creds = await secretsManagerConfig.getRdsCredentials();

    const p = new Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: creds.username,
      password: creds.password,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
      statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    });

    p.on('error', (err: Error) => {
      log.error(METHOD.BUILD_POOL, LOG_MESSAGES.DB_POOL_IDLE_CLIENT_ERROR, { error: err.message });
    });

    this.credentialFetchedAt = creds.fetchedAt;

    log.info(METHOD.BUILD_POOL, LOG_MESSAGES.DB_POOL_INITIALISED, {
      host: env.DB_HOST,
      db: env.DB_NAME,
      poolMax: env.DB_POOL_MAX,
      credentialFetchedAt: new Date(creds.fetchedAt).toISOString(),
    });
    log.end(METHOD.BUILD_POOL);
    return p;
  }

  private async rebuildAfterAuthFailure(): Promise<void> {
    log.start(METHOD.REBUILD_AFTER_AUTH_FAILURE);
    log.warn(METHOD.REBUILD_AFTER_AUTH_FAILURE, LOG_MESSAGES.DB_POOL_REBUILD_AFTER_AUTH_FAILURE);

    secretsManagerConfig.invalidateCache();

    const old = this.pool;
    this.pool = undefined;
    this.credentialFetchedAt = undefined;

    if (old) {
      try {
        await old.end();
      } catch (err) {
        log.warn(METHOD.REBUILD_AFTER_AUTH_FAILURE, LOG_MESSAGES.DB_POOL_DRAIN_ERROR, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.pool = await this.buildPool();
    log.end(METHOD.REBUILD_AFTER_AUTH_FAILURE);
  }

  private isPostgresAuthError(err: unknown): { auth: boolean; pgCode?: string } {
    if (typeof err !== 'object' || err === null) return { auth: false };
    const code = (err as { code?: unknown }).code;
    if (typeof code !== 'string') return { auth: false };
    return { auth: POSTGRES_INVALID_AUTH_CODES.has(code), pgCode: code };
  }

  
  resetForTest(): void {
    this.pool = undefined;
    this.credentialFetchedAt = undefined;
  }
}

export const databasePoolConfig = new DatabasePoolConfig();
