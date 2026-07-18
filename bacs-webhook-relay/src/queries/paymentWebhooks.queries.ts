import { databasePoolConfig } from '../config/databasePool.config';
import { createLogger } from '../util/logger';
import { TABLES } from '../constants/database.constants';
import { WEBHOOK_STATUS, RELAY_UPDATED_BY } from '../constants/status.constants';
import type { PaymentWebhookRow } from '../types';

const log = createLogger('paymentWebhooks.queries.ts');

const METHOD = {
  SELECT_PENDING_FOR_RELAY: 'selectPendingForRelay',
  UPDATE_AFTER_RELAY: 'updateAfterRelay',
  UPDATE_TO_DEAD_LETTER: 'updateToDeadLetter',
} as const;

export const SQL_SELECT_PENDING_FOR_RELAY = `
  SELECT id, webhook_id, payment_id, event_type, status, raw_payload,
         enqueued_at, created_by, updated_by, correlation_id,
         created_at, updated_at
    FROM ${TABLES.PAYMENT_WEBHOOKS}
   WHERE LOWER(status) = $1
     AND (
       enqueued_at IS NULL
       OR (enqueued_at IS NOT NULL AND updated_by IS NULL AND updated_at < NOW() - INTERVAL '5 minutes')
     )
   ORDER BY created_at ASC
   LIMIT $2
   FOR UPDATE SKIP LOCKED
`;

export async function selectPendingForRelay(limit: number): Promise<PaymentWebhookRow[]> {
  log.start(METHOD.SELECT_PENDING_FOR_RELAY, { limit });

  const { rows } = await databasePoolConfig.query<PaymentWebhookRow>(
    SQL_SELECT_PENDING_FOR_RELAY,
    [WEBHOOK_STATUS.PENDING, limit],
  );

  log.end(METHOD.SELECT_PENDING_FOR_RELAY, { count: rows.length });
  return rows;
}

export const SQL_UPDATE_AFTER_RELAY = `
  UPDATE ${TABLES.PAYMENT_WEBHOOKS}
     SET enqueued_at = COALESCE(enqueued_at, NOW()),
         updated_at  = NOW(),
         updated_by  = $1
   WHERE webhook_id  = $2
     AND LOWER(status) = $3
`;

export async function updateAfterRelay(webhookId: string): Promise<number> {
  log.start(METHOD.UPDATE_AFTER_RELAY, { webhookId });

  const result = await databasePoolConfig.query(
    SQL_UPDATE_AFTER_RELAY,
    [RELAY_UPDATED_BY, webhookId, WEBHOOK_STATUS.PENDING],
  );

  log.end(METHOD.UPDATE_AFTER_RELAY, { webhookId, rowCount: result.rowCount ?? 0 });
  return result.rowCount ?? 0;
}

export const SQL_UPDATE_TO_DEAD_LETTER = `
  UPDATE ${TABLES.PAYMENT_WEBHOOKS}
     SET status     = $1,
         updated_at = NOW(),
         updated_by = $2
   WHERE webhook_id = $3
`;

export async function updateToDeadLetter(webhookId: string): Promise<number> {
  log.start(METHOD.UPDATE_TO_DEAD_LETTER, { webhookId });

  const result = await databasePoolConfig.query(
    SQL_UPDATE_TO_DEAD_LETTER,
    [WEBHOOK_STATUS.DEAD_LETTER, RELAY_UPDATED_BY, webhookId],
  );

  log.end(METHOD.UPDATE_TO_DEAD_LETTER, { webhookId, rowCount: result.rowCount ?? 0 });
  return result.rowCount ?? 0;
}
