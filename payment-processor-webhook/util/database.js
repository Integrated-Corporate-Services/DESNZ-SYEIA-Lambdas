import pg from 'pg';
import log from './logger.js';
const { Pool } = pg;
let pool = null;
export function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      max: 10,
    });
  }
  return pool;
}
export async function query(text, values) {
  try {
    const res = await getPool().query(text, values);
    return res;
  } catch (err) {
    log.error('[database] Query error', { err });
    throw err;
  }
}
