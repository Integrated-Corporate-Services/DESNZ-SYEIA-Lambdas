import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import log from './logger.js';
import {
  getDbHost,
  getDbName,
  getDbPort,
  resolveDbCredentials,
  shouldUseDbSsl,
} from './dbConfig.js';

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

export interface DatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export async function ensurePoolInitialized(): Promise<void> {
  if (pool) {
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const credentials = await resolveDbCredentials();

      const config: DatabaseConfig = {
        host: getDbHost(),
        port: getDbPort(),
        database: getDbName(),
        user: credentials.username,
        password: credentials.password,
        ssl: shouldUseDbSsl() ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.DB_POOL_SIZE || '5', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

      pool = new Pool(config);

      pool.on('error', (err: Error) => {
        log.error('[database] Unexpected pool error', { error: err.message });
      });

      log.info('[database] Database pool initialized', {
        host: config.host,
        port: config.port,
        database: config.database,
        ssl: Boolean(config.ssl),
      });
    })();
  }

  await initPromise;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call ensurePoolInitialized() first.');
  }

  return pool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
  retries: number = 3
): Promise<QueryResult<T>> {
  let lastError: Error | undefined;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await getPool().query<T>(text, values);
      const duration = Date.now() - startTime;

      if (duration > 1000) {
        log.warn('[database] Slow query detected', {
          query: text.substring(0, 100),
          duration,
          rowCount: res.rowCount,
        });
      }

      return res;
    } catch (err) {
      lastError = err as Error;

      if (lastError.message.includes('syntax error')) {
        log.error('[database] Query syntax error', {
          query: text.substring(0, 100),
          error: lastError.message,
        });
        throw lastError;
      }

      if (attempt < retries) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        log.warn('[database] Query failed, retrying', {
          attempt,
          delay,
          error: (lastError as any).code,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  log.error('[database] Query failed after retries', {
    query: text.substring(0, 100),
    error: lastError?.message,
  });
  throw lastError;
}

export async function beginTransaction(): Promise<QueryResult> {
  return await query('BEGIN');
}

export async function commitTransaction(): Promise<QueryResult> {
  return await query('COMMIT');
}

export async function rollbackTransaction(): Promise<QueryResult> {
  return await query('ROLLBACK');
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    initPromise = null;
  }
}

export async function getClient(): Promise<PoolClient> {
  return await getPool().connect();
}
