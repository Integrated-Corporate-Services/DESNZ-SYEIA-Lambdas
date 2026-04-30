/**
 * PostgreSQL Database Connection
 * 
 * Connects to RDS PostgreSQL for storing email request records
 */

import pg from 'pg';
import log from './logger.js';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000'),
});

/**
 * Execute SQL query
 */
export async function query(text, params) {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    log.debug('[database] Query executed', {
      duration,
      rows: result.rowCount,
    });

    return result;

  } catch (error) {
    const duration = Date.now() - start;

    log.error('[database] Query failed', {
      error: error.message,
      duration,
    });

    throw error;
  }
}

/**
 * Get a client from the pool (for transactions)
 */
export async function getClient() {
  return await pool.connect();
}

/**
 * Close the pool (for graceful shutdown)
 */
export async function close() {
  await pool.end();
  log.info('[database] Connection pool closed');
}

export default {
  query,
  getClient,
  close,
};
