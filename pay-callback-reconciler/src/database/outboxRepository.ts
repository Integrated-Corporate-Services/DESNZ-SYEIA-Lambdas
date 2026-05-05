import { QueryResult } from 'pg';
import { query } from '../util/database.js';
import { outboxQueries } from '../queries/index.js';
import type { OutboxRecord } from '../types/index.js';

export async function createOutboxRecord(record: {
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  payload_snapshot_json: string;
  created_at: Date | string;
}): Promise<number> {
  const result: QueryResult<{ id: number }> = await query(
    outboxQueries.createOutboxRecord,
    [record.aggregate_id, record.aggregate_type, record.event_type, record.payload_snapshot_json, record.created_at]
  );
  if (!result.rows[0]) {
    throw new Error('Failed to create outbox record');
  }
  return result.rows[0].id;
}

export async function getUnprocessedRecords(limit: number = 100): Promise<OutboxRecord[]> {
  const result: QueryResult<OutboxRecord> = await query(
    outboxQueries.getUnprocessedRecords,
    [limit]
  );
  return result.rows;
}

export async function markRecordProcessed(id: number): Promise<void> {
  await query(outboxQueries.markRecordProcessed, [id]);
}

export async function markRecordFailed(id: number, errorMessage: string): Promise<void> {
  await query(outboxQueries.markRecordFailed, [errorMessage, id]);
}
