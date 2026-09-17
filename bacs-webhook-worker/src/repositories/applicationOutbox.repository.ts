import { PoolClient } from 'pg';
import { getPool } from './payment.repository';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES, LOG_CHILD_DOMAIN, LOG_EVENTS } from '../constants/log.constants';
import { applicationOutboxQueries } from '../queries/applicationOutbox.queries';
import { DatabaseError } from '../errors/worker.errors';
import type { InsertBacsPaymentOutboxParams } from '../types/applicationOutbox.types';

const log = createLogger('applicationOutbox.repository.ts', LOG_CHILD_DOMAIN.OUTBOX_REPOSITORY);

const METHOD = {
  INSERT_OUTBOX_ROW: 'insertOutboxRow',
} as const;

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code: unknown }).code === UNIQUE_VIOLATION,
  );
}

async function findExistingOutboxId(client: PoolClient, idempotencyKey: string): Promise<string | null> {
  const existing = await client.query(applicationOutboxQueries.FIND_EXISTING_BY_IDEMPOTENCY_KEY, [idempotencyKey]);
  return existing.rows[0]?.outbox_id ?? null;
}

function logDuplicate(recordId: string, applicationId: string, idempotencyKey: string, outboxId: string | null): void {
  log.info(METHOD.INSERT_OUTBOX_ROW, LOG_MESSAGES.OUTBOX_ALREADY_RECORDED, {
    recordId,
    applicationId,
    idempotencyKey,
    outboxId,
  }, LOG_EVENTS.OUTBOX_DUPLICATE);
}

export const applicationOutboxRepository = {
  insertOutboxRow: async (params: InsertBacsPaymentOutboxParams, recordId: string): Promise<string | null> => {
    const { applicationId, eventType, payload, idempotencyKey } = params;
    log.start(METHOD.INSERT_OUTBOX_ROW, { recordId, applicationId, idempotencyKey });

    try {
      const client = await getPool().connect();
      try {
        const existingId = await findExistingOutboxId(client, idempotencyKey);
        if (existingId) {
          logDuplicate(recordId, applicationId, idempotencyKey, existingId);
          log.end(METHOD.INSERT_OUTBOX_ROW, { recordId, outboxId: existingId });
          return existingId;
        }

        try {
          const result = await client.query(applicationOutboxQueries.INSERT_BACS_PAYMENT_EVENT, [
            applicationId,
            eventType,
            JSON.stringify(payload),
            idempotencyKey,
          ]);

          const outboxId = result.rows[0]?.outbox_id ?? null;
          log.info(METHOD.INSERT_OUTBOX_ROW, LOG_MESSAGES.OUTBOX_EVENT_INSERTED, {
            recordId,
            applicationId,
            eventType,
            outboxId,
          }, LOG_EVENTS.OUTBOX_INSERTED);
          log.end(METHOD.INSERT_OUTBOX_ROW, { recordId, outboxId });
          return outboxId;
        } catch (error) {
          if (isUniqueViolation(error)) {
            const outboxId = await findExistingOutboxId(client, idempotencyKey);
            logDuplicate(recordId, applicationId, idempotencyKey, outboxId);
            log.end(METHOD.INSERT_OUTBOX_ROW, { recordId, outboxId });
            return outboxId;
          }
          throw error;
        }
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.INSERT_OUTBOX_ROW, LOG_MESSAGES.OUTBOX_INSERT_FAILED, {
        recordId,
        applicationId,
        error: message,
      }, LOG_EVENTS.OUTBOX_FAILED);
      throw new DatabaseError(`Failed to insert application_outbox event: ${message}`);
    }
  },
};
