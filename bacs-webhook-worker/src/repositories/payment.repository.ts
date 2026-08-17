import { Pool, PoolClient } from 'pg';
import { createLogger } from '../util/logger';
import { envConfig } from '../config/env.config';
import { LOG_MESSAGES } from '../constants/log.constants';
import { DatabaseError } from '../errors/worker.errors';

const log = createLogger('payment.repository');

let pool: Pool | null = null;
// function for the get pool
function getPool(): Pool {
  if (!pool) {
    const config = envConfig.get();
    pool = new Pool({
      host: config.dbHost,
      port: config.dbPort,
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export const paymentRepository = {
  connect: async (): Promise<void> => {
    try {
      log.start('connect');
      const p = getPool();
      await p.query('SELECT 1');
      log.end('connect');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(LOG_MESSAGES.DB_CONNECT_ERROR, { error: message });
      throw new DatabaseError(`Failed to connect to database: ${message}`);
    }
  },

  disconnect: async (): Promise<void> => {
    try {
      if (pool) {
        await pool.end();
        pool = null;
        log.info('Database connection closed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Error closing database connection', { error: message });
    }
  },

  recordPayment: async (transactionId: string, amount: number, status: string): Promise<void> => {
    let client: PoolClient | null = null;
    try {
      log.start('recordPayment', { transactionId });

      client = await getPool().connect();
      const query = `
        INSERT INTO payments (transaction_id, amount, status, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (transaction_id) DO UPDATE
        SET status = $3, updated_at = NOW()
      `;

      await client.query(query, [transactionId, amount, status]);
      log.end('recordPayment', { transactionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(LOG_MESSAGES.DB_QUERY_ERROR, { error: message, transactionId });
      throw new DatabaseError(`Failed to record payment: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },

  getPaymentStatus: async (transactionId: string): Promise<string | null> => {
    let client: PoolClient | null = null;
    try {
      log.start('getPaymentStatus', { transactionId });

      client = await getPool().connect();
      const query = 'SELECT status FROM payments WHERE transaction_id = $1';
      const result = await client.query(query, [transactionId]);

      const status = result.rows.length > 0 ? result.rows[0].status : null;
      log.end('getPaymentStatus', { transactionId, status });

      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(LOG_MESSAGES.DB_QUERY_ERROR, { error: message, transactionId });
      throw new DatabaseError(`Failed to get payment status: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },
};
