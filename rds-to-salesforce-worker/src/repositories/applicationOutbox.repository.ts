import type { Pool } from 'pg';
import { createLogger } from '../util/logger';
import type { ApplicationOutboxRow, ApplicationOutboxRepository, FailedAttemptResult } from '../types';

const logger = createLogger('applicationOutbox.repository');

const SQL_FIND_BY_OUTBOX_ID = `SELECT * FROM application_outbox WHERE outbox_id = $1`;

const SQL_MARK_SENT = `
  UPDATE application_outbox
     SET status = 'SENT',
         salesforce_record_id = $2,
         last_response_payload = $3,
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
   WHERE outbox_id = $1
`;

const SQL_RECORD_FAILED_ATTEMPT = `
  UPDATE application_outbox
     SET attempt_count = attempt_count + 1,
         last_error_code = $2,
         last_error_message = $3,
         last_response_payload = $4,
         status = CASE WHEN attempt_count + 1 >= $5 THEN 'FATAL' ELSE status END,
         updated_at = NOW()
   WHERE outbox_id = $1
   RETURNING attempt_count, status
`;

const SQL_MARK_FATAL = `
  UPDATE application_outbox
     SET status = 'FATAL',
         last_error_code = $2,
         last_error_message = $3,
         last_response_payload = $4,
         updated_at = NOW()
   WHERE outbox_id = $1
`;

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
      await pool.query(SQL_MARK_SENT, [outboxId, salesforceRecordId, responsePayload]);
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

      const row = result.rows[0];
      logger.warn('Recorded failed Salesforce attempt', {
        outboxId,
        attemptCount: row?.attempt_count,
        status: row?.status,
        errorCode: params.errorCode,
      });

      return { attemptCount: row?.attempt_count ?? 0, status: row?.status ?? 'ENQUEUED' };
    },

    async markFatal(
      outboxId: string,
      params: { errorCode: string; errorMessage: string; responsePayload: Record<string, unknown> | null },
    ): Promise<void> {
      await pool.query(SQL_MARK_FATAL, [outboxId, params.errorCode, params.errorMessage, params.responsePayload]);
      logger.error('Marked outbox row as FATAL', {
        outboxId,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      });
    },
  };
}
