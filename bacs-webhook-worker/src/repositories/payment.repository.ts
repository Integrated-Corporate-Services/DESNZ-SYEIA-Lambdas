import { Pool, PoolClient } from 'pg';
import { createLogger } from '../util/logger';
import { envConfig } from '../config/env.config';
import { LOG_MESSAGES } from '../constants/log.constants';
import { DatabaseError } from '../errors/worker.errors';

const log = createLogger('payment.repository.ts');

const METHOD = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECORD_PAYMENT: 'recordPayment',
  GET_PAYMENT_STATUS: 'getPaymentStatus',
  MARK_WEBHOOK_PROCESSED: 'markWebhookProcessed',
} as const;

let pool: Pool | null = null;
// function for the get pool
// Exported so other repositories (e.g. applicationOutbox.repository.ts) reuse the same
// singleton connection pool instead of opening a second pool against the same database.
export function getPool(): Pool {
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
    log.start(METHOD.CONNECT);
    try {
      const p = getPool();
      await p.query('SELECT 1');
      log.info(METHOD.CONNECT, LOG_MESSAGES.DB_CONNECTED);
      log.end(METHOD.CONNECT);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.CONNECT, LOG_MESSAGES.DB_CONNECT_ERROR, { error: message });
      throw new DatabaseError(`Failed to connect to database: ${message}`);
    }
  },

  disconnect: async (): Promise<void> => {
    log.start(METHOD.DISCONNECT);
    try {
      if (pool) {
        await pool.end();
        pool = null;
      }
      log.end(METHOD.DISCONNECT);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.DISCONNECT, LOG_MESSAGES.DB_QUERY_ERROR, { error: message });
    }
  },

  recordPayment: async (transactionId: string, amount: number, status: string): Promise<void> => {
    log.start(METHOD.RECORD_PAYMENT, { transactionId, amount, status });
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const query = `
        INSERT INTO payments (transaction_id, amount, status, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (transaction_id) DO UPDATE
        SET status = $3, updated_at = NOW()
      `;

      await client.query(query, [transactionId, amount, status]);
      log.info(METHOD.RECORD_PAYMENT, LOG_MESSAGES.PAYMENT_RECORDED, { transactionId, amount, status });
      log.end(METHOD.RECORD_PAYMENT, { transactionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.RECORD_PAYMENT, LOG_MESSAGES.DB_QUERY_ERROR, { error: message, transactionId });
      throw new DatabaseError(`Failed to record payment: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },

  getPaymentStatus: async (transactionId: string): Promise<string | null> => {
    log.start(METHOD.GET_PAYMENT_STATUS, { transactionId });
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const query = 'SELECT status FROM payments WHERE transaction_id = $1';
      const result = await client.query(query, [transactionId]);

      const status = result.rows.length > 0 ? result.rows[0].status : null;
      log.end(METHOD.GET_PAYMENT_STATUS, { transactionId, status });

      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.GET_PAYMENT_STATUS, LOG_MESSAGES.DB_QUERY_ERROR, { error: message, transactionId });
      throw new DatabaseError(`Failed to get payment status: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },

  markWebhookProcessed: async (webhookId: string, processedBy: string): Promise<void> => {
    log.start(METHOD.MARK_WEBHOOK_PROCESSED, { webhookId, processedBy });
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const query = `
        UPDATE payment_webhooks
        SET 
          status = 'processed',
          updated_at = NOW(),
          updated_by = $2
        WHERE webhook_id = $1
          AND status != 'processed'
      `;

      const result = await client.query(query, [webhookId, processedBy]);

      if (result.rowCount === 0) {
        log.warn(METHOD.MARK_WEBHOOK_PROCESSED, LOG_MESSAGES.WEBHOOK_ALREADY_PROCESSED, { webhookId });
      } else {
        log.info(METHOD.MARK_WEBHOOK_PROCESSED, LOG_MESSAGES.WEBHOOK_MARKED_PROCESSED, {
          webhookId,
          status: 'processed',
          rowsUpdated: result.rowCount,
        });
      }

      log.end(METHOD.MARK_WEBHOOK_PROCESSED, { webhookId, rowsUpdated: result.rowCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.MARK_WEBHOOK_PROCESSED, LOG_MESSAGES.DB_QUERY_ERROR, { error: message, webhookId });
      throw new DatabaseError(`Failed to mark webhook as processed: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },
};
