import type { Pool, PoolClient } from 'pg';
import { initDbPool } from '../../util/db.js';
import log from '../../util/logger.js';
import type { OutboxQueuedRepository } from '../types/index.js';
import { SQL_MARK_SQS_ENQUEUED } from '../queries/outboxQueued.queries.js';

class PgOutboxQueuedRepository implements OutboxQueuedRepository {
  async markQueued(outboxId: string): Promise<void> {
    const pool: Pool = await initDbPool();
    const client: PoolClient = await pool.connect();
    log.info(`[SQS_DELIVERY][REPOSITORY][MARK_ENQUEUED][START] - updating outbox status - outboxId=${outboxId}`);
    try {
      await client.query('BEGIN');
      const result = await client.query(SQL_MARK_SQS_ENQUEUED, [outboxId, 'ENQUEUED']);
      if (result.rowCount !== 1) {
        throw new Error(`Expected to update 1 row for outbox_id=${outboxId}, updated ${result.rowCount ?? 0}`);
      }
      await client.query('COMMIT');
      log.info(`[SQS_DELIVERY][REPOSITORY][MARK_ENQUEUED][END] - outbox status updated - outboxId=${outboxId}`);
    } catch (error) {
      log.error(`[SQS_DELIVERY][REPOSITORY][MARK_ENQUEUED][FAILED] - rolling back error=${error instanceof Error ? error.message : String(error)} - outboxId=${outboxId}`);
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
