import pg from 'pg';
import log from './logger.js';
const { Pool } = pg;

// Global pool for Lambda container reuse
let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_SIZE || '5'),  // Lower for Lambda
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      log.error('[database] Unexpected pool error', { error: err.message });
    });
  }
  return pool;
}

export async function query(text, values, retries = 3) {
  let lastError;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await getPool().query(text, values);
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
      lastError = err;

      // Don't retry syntax errors
      if (err.message.includes('syntax error')) {
        log.error('[database] Query syntax error', { query: text.substring(0, 100), error: err.message });
        throw err;
      }

      if (attempt < retries) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        log.warn('[database] Query failed, retrying', {
          attempt,
          delay,
          error: err.code,
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  log.error('[database] Query failed after retries', {
    query: text.substring(0, 100),
    error: lastError.message,
  });
  throw lastError;
}

// Begin transaction
export async function beginTransaction() {
  return await query('BEGIN');
}

// Commit transaction
export async function commitTransaction() {
  return await query('COMMIT');
}

// Rollback transaction
export async function rollbackTransaction() {
  return await query('ROLLBACK');
}

// Close pool (for graceful shutdown)
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
