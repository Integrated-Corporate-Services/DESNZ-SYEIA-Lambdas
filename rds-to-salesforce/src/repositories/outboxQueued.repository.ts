/**
 * Outbox Queued Repository
 * Marks an application_outbox row QUEUED once it has been handed off to SQS.
 * Deliberately outside claimBatch()'s WHERE status IN ('PENDING','ERROR')
 * filter in outboxRepo.js, so a queued-but-in-flight row is never reclaimed.
 *
 * Reuses the existing shared pg pool (util/db.js) - no parallel DB infra.
 */
import type { Pool, PoolClient } from 'pg';
import { initDbPool } from '../../util/db.js';
import type { OutboxQueuedRepository } from '../types/index.js';

const SQL_MARK_SQS_QUEUED = `
  UPDATE application_outbox
     SET status = $2, last_error_message = NULL, updated_at = NOW()
   WHERE outbox_id = $1
`;

class PgOutboxQueuedRepository implements OutboxQueuedRepository {
  async markQueued(outboxId: number): Promise<void> {
    const pool: Pool = await initDbPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(SQL_MARK_SQS_QUEUED, [outboxId, 'QUEUED']);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const outboxQueuedRepository: OutboxQueuedRepository = new PgOutboxQueuedRepository();
