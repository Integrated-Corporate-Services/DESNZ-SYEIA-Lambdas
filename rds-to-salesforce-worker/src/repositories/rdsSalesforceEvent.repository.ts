import type { Pool } from 'pg';
import { createLogger } from '../util/logger';
import type { RdsSalesforceEventRow, RdsSalesforceEventRepository } from '../types';

const logger = createLogger('rdsSalesforceEvent.repository');

/**
 * Factory function to create RDS Salesforce Event Repository
 */
export function rdsSalesforceEventRepository(pool: Pool): RdsSalesforceEventRepository {
  return {
    /**
     * Find event by ID
     */
    async findById(id: string): Promise<RdsSalesforceEventRow | null> {
      const result = await pool.query<RdsSalesforceEventRow>(
        `SELECT id, record_id, table_name, operation, data_payload,
                processing_status, salesforce_id, failure_reason,
                correlation_id, created_at, updated_at, processed_at
         FROM rds_salesforce_event
         WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        logger.warn('Event not found', { eventId: id });
        return null;
      }

      return result.rows[0];
    },

    /**
     * Mark event as processing
     */
    async markProcessing(id: string): Promise<void> {
      await pool.query(
        `UPDATE rds_salesforce_event
         SET processing_status = 'PROCESSING',
             updated_at = NOW()
         WHERE id = $1`,
        [id],
      );

      logger.info('Marked event as PROCESSING', { eventId: id });
    },

    /**
     * Mark event as processed successfully
     */
    async markProcessed(id: string, salesforceId: string): Promise<void> {
      await pool.query(
        `UPDATE rds_salesforce_event
         SET processing_status = 'PROCESSED',
             salesforce_id = $2,
             processed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id, salesforceId],
      );

      logger.info('Marked event as PROCESSED', { eventId: id, salesforceId });
    },

    /**
     * Mark event as retryable failure
     */
    async markRetryableFailure(id: string, reason: string): Promise<void> {
      await pool.query(
        `UPDATE rds_salesforce_event
         SET processing_status = 'FAILED_RETRYABLE',
             failure_reason = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [id, reason],
      );
      logger.info('Marked event as FAILED_RETRYABLE', { eventId: id, reason });
    },

    /**
     * Mark event as fatal (non-retryable failure)
     */
    async markFatal(id: string, reason: string): Promise<void> {
      await pool.query(
        `UPDATE rds_salesforce_event
         SET processing_status = 'FATAL',
             failure_reason = $2,
             processed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [id, reason],
      );

      logger.info('Marked event as FATAL', { eventId: id, reason });
    },
  };
}
