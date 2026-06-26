import type { Pool, QueryResult } from 'pg';
import { createLogger } from '../util/logger';
import type { NotifyCallbackEventRow, NotifyCallbackEventRepository } from '../types';

const logger = createLogger('notifyCallback.repository');

/**
 * Create Notify Callback Event Repository
 * @param pool - PostgreSQL connection pool
 */
export function notifyCallbackRepository(pool: Pool): NotifyCallbackEventRepository {
  return {
    async findById(id: string): Promise<NotifyCallbackEventRow | null> {
      const result: QueryResult<NotifyCallbackEventRow> = await pool.query(
        `SELECT id, notify_notification_id, reference, notification_type, status,
                payload_json, processing_status, failure_reason, correlation_id
         FROM notify_callback_event
         WHERE id = $1`,
        [id],
      );

      return result.rows[0] || null;
    },

    async markProcessing(id: string): Promise<void> {
      await pool.query(
        `UPDATE notify_callback_event
         SET processing_status = 'PROCESSING', updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
      logger.debug('Marked event as PROCESSING', { eventId: id });
    },

    async markProcessed(id: string): Promise<void> {
      await pool.query(
        `UPDATE notify_callback_event
         SET processing_status = 'PROCESSED',
             processed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id],
      );
      logger.debug('Marked event as PROCESSED', { eventId: id });
    },

    async markRetryableFailure(id: string, reason: string): Promise<void> {
      await pool.query(
        `UPDATE notify_callback_event
         SET processing_status = 'FAILED_RETRYABLE',
             failure_reason = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [id, reason],
      );
      logger.debug('Marked event as FAILED_RETRYABLE', { eventId: id, reason });
    },

    async markFatal(id: string, reason: string): Promise<void> {
      await pool.query(
        `UPDATE notify_callback_event
         SET processing_status = 'FATAL',
             failure_reason = $2,
             processed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id, reason],
      );
      logger.debug('Marked event as FATAL', { eventId: id, reason });
    },
  };
}
