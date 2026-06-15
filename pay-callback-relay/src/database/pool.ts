import { Pool } from 'pg';
import log from '../util/logger';
import {
  getDbHost,
  getDbName,
  getDbPort,
  resolveDbCredentials,
  shouldUseDbSsl,
} from '../util/dbConfig';

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

export async function ensurePoolInitialized(): Promise<void> {
  if (pool) {
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const credentials = await resolveDbCredentials();

        pool = new Pool({
          host: getDbHost(),
          port: getDbPort(),
          user: credentials.username,
          password: credentials.password,
          database: getDbName(),
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          ssl: shouldUseDbSsl() ? { rejectUnauthorized: false } : false,
        });

        pool.on('error', (err) => {
          log.error('[database] Unexpected pool error', { error: err.message });
        });

        log.info('[database] Database pool initialized', {
          host: getDbHost(),
          port: getDbPort(),
          database: getDbName(),
          ssl: shouldUseDbSsl(),
        });
      } catch (err) {
        initPromise = null;
        throw err;
      }
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
