import { Pool, PoolClient } from 'pg';
import { createLogger } from '../util/logger';
import { envConfig } from '../config/env.config';
import { LOG_MESSAGES } from '../constants/log.constants';
import { DatabaseError } from '../errors/worker.errors';
import { paymentQueries } from '../queries/payment.queries';

const log = createLogger('payment.repository.ts');

const METHOD = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  RECORD_PAYMENT: 'recordPayment',
  GET_PAYMENT_STATUS: 'getPaymentStatus',
  MARK_WEBHOOK_PROCESSED: 'markWebhookProcessed',
  FIND_APPLICATION_BY_INVOICE_NUMBER: 'findApplicationByInvoiceNumber',
  FIND_DESNZ_REF_BY_APPLICATION_ID: 'findDesnzReferenceByApplicationId',
} as const;

export interface InvoiceApplicationLookup {
  applicationId: string;
  invoiceNumber: string;
  paymentMethod: string | null;
}

let pool: Pool | null = null;
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
      await client.query(paymentQueries.RECORD_PAYMENT, [transactionId, amount, status]);
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

  findApplicationByInvoiceNumber: async (invoiceNumber: string): Promise<InvoiceApplicationLookup | null> => {
    log.start(METHOD.FIND_APPLICATION_BY_INVOICE_NUMBER, { invoiceNumber });
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const result = await client.query(paymentQueries.FIND_APPLICATION_BY_INVOICE_NUMBER, [invoiceNumber]);

      if (result.rows.length === 0) {
        log.end(METHOD.FIND_APPLICATION_BY_INVOICE_NUMBER, { invoiceNumber, applicationId: null });
        return null;
      }

      const row = result.rows[0];
      const lookup: InvoiceApplicationLookup = {
        applicationId: row.application_id,
        invoiceNumber: row.invoice_number,
        paymentMethod: row.payment_method ?? null,
      };
      log.end(METHOD.FIND_APPLICATION_BY_INVOICE_NUMBER, { invoiceNumber, applicationId: lookup.applicationId });

      return lookup;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.FIND_APPLICATION_BY_INVOICE_NUMBER, LOG_MESSAGES.DB_QUERY_ERROR, { error: message, invoiceNumber });
      throw new DatabaseError(`Failed to find application by invoice number: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },

  findDesnzReferenceByApplicationId: async (applicationId: string): Promise<string | null> => {
    log.start(METHOD.FIND_DESNZ_REF_BY_APPLICATION_ID, { applicationId });
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const result = await client.query(paymentQueries.FIND_DESNZ_REF_BY_APPLICATION_ID, [applicationId]);

      const desnzReference = result.rows.length > 0 ? result.rows[0].desnz_ref : null;
      log.end(METHOD.FIND_DESNZ_REF_BY_APPLICATION_ID, { applicationId, desnzReference });

      return desnzReference;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.FIND_DESNZ_REF_BY_APPLICATION_ID, LOG_MESSAGES.DB_QUERY_ERROR, { error: message, applicationId });
      throw new DatabaseError(`Failed to find desnz reference by application id: ${message}`);
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
      const result = await client.query(paymentQueries.GET_PAYMENT_STATUS, [transactionId]);

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
      const result = await client.query(paymentQueries.MARK_WEBHOOK_PROCESSED, [webhookId, processedBy]);

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
