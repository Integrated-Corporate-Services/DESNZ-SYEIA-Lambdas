import { getPool } from '../database/pool';
import { WebhookRow } from '../types';
import { TABLE_PAYMENT_WEBHOOKS, STATUS_PROCESSING } from '../constants';

export async function getUnenqueuedWebhooks(limit = 10): Promise<WebhookRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<WebhookRow>(
    `SELECT webhook_id, payment_id, event_type, status, raw_payload, correlation_id
     FROM ${TABLE_PAYMENT_WEBHOOKS}
     WHERE enqueued_at IS NULL AND status = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [STATUS_PROCESSING, limit]
  );
  return rows;
}

export async function markWebhookEnqueued(webhookId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ${TABLE_PAYMENT_WEBHOOKS} 
     SET enqueued_at = NOW(), 
         updated_at = NOW(), 
         updated_by = 'pay-callback-relay'
     WHERE webhook_id = $1 
       AND enqueued_at IS NULL`,
    [webhookId]
  );
}
