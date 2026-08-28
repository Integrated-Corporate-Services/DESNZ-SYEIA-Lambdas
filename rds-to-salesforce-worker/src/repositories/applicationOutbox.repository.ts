import type { Pool } from 'pg';
import { createLogger } from '../util/logger';
import type { ApplicationOutboxRow, ApplicationOutboxRepository, FailedAttemptResult } from '../types';
import { SQL_FIND_BY_OUTBOX_ID, SQL_MARK_SENT, SQL_RECORD_FAILED_ATTEMPT, SQL_MARK_FATAL } from '../queries/applicationOutbox.queries';

const logger = createLogger('applicationOutbox.repository');

export function applicationOutboxRepository(pool: Pool): ApplicationOutboxRepository {
  return {
    async findByOutboxId(outboxId: string): Promise<ApplicationOutboxRow | null> {
      const result = await pool.query<ApplicationOutboxRow>(SQL_FIND_BY_OUTBOX_ID, [outboxId]);

      if (result.rows.length === 0) {
        logger.warn('Outbox row not found', { outboxId });
        return null;
      }

      return result.rows[0];
    },

    async markSent(outboxId: string, salesforceRecordId: string, responsePayload: Record<string, unknown>): Promise<void> {
      const result = await pool.query(SQL_MARK_SENT, [outboxId, salesforceRecordId, responsePayload]);
      if (result.rowCount !== 1) {
        throw new Error(`Expected to update 1 row for outbox_id=${outboxId}, updated ${result.rowCount ?? 0}`);
      }
      logger.info('Marked outbox row as SENT', { outboxId, salesforceRecordId });
    },

    async recordFailedAttempt(
      outboxId: string,
      params: { errorCode: string; errorMessage: string; responsePayload: Record<string, unknown> | null; maxRetries: number },
    ): Promise<FailedAttemptResult> {
      const result = await pool.query<{ attempt_count: number; status: string }>(SQL_RECORD_FAILED_ATTEMPT, [
        outboxId,
        params.errorCode,
        params.errorMessage,
        params.responsePayload,
        params.maxRetries,
      ]);

      if (result.rows.length !== 1) {
        throw new Error(`Expected to update 1 row for outbox_id=${outboxId}, updated ${result.rowCount ?? 0}`);
      }

      const row = result.rows[0];
      logger.warn('Recorded failed Salesforce attempt', {
        outboxId,
        attemptCount: row.attempt_count,
        status: row.status,
        errorCode: params.errorCode,
      });

      return { attemptCount: row.attempt_count, status: row.status };
    },

    async markFatal(
      outboxId: string,
      params: { errorCode: string; errorMessage: string; responsePayload: Record<string, unknown> | null },
    ): Promise<void> {
      const result = await pool.query(SQL_MARK_FATAL, [outboxId, params.errorCode, params.errorMessage, params.responsePayload]);
      if (result.rowCount !== 1) {
        throw new Error(`Expected to update 1 row for outbox_id=${outboxId}, updated ${result.rowCount ?? 0}`);
      }
      logger.error('Marked outbox row as FATAL', {
        outboxId,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      });
    },
  };
}
