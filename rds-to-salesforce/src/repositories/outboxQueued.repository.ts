import type { Pool, PoolClient } from 'pg';
import { initDbPool } from '../../util/db.js';
import type { OutboxQueuedRepository } from '../types/index.js';
import { SQL_MARK_SQS_ENQUEUED } from '../queries/outboxQueued.queries.js';

class PgOutboxQueuedRepository implements OutboxQueuedRepository {
  async markQueued(outboxId: string): Promise<void> {
    const pool: Pool = await initDbPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(SQL_MARK_SQS_ENQUEUED, [outboxId, 'ENQUEUED']);
      if (result.rowCount !== 1) {
        throw new Error(`Expected to update 1 row for outbox_id=${outboxId}, updated ${result.rowCount ?? 0}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  }
}

export const outboxQueuedRepository: OutboxQueuedRepository = new PgOutboxQueuedRepository();
