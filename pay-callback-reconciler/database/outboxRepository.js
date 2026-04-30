import { query } from '../util/database.js';
export async function createOutboxRecord(record) {
  const result = await query(
    'INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [record.aggregate_id, record.aggregate_type, record.event_type, record.payload_snapshot_json, record.created_at]
  );
  return result.rows[0].outbox_id;
}
