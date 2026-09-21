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

export const applicationOutboxRepository = {
  insertOutboxRow: async (params: InsertBacsPaymentOutboxParams, recordId: string): Promise<string | null> => {
    const { applicationId, eventType, payload, idempotencyKey } = params;
    log.start(METHOD.INSERT_OUTBOX_ROW, { recordId, applicationId, idempotencyKey });

    let client;
    try {
      client = await getPool().connect();

      const result = await client.query(applicationOutboxQueries.INSERT_BACS_PAYMENT_EVENT, [
        applicationId,
        eventType,
        JSON.stringify(payload),
        idempotencyKey,
      ]);

      if (result.rows.length > 0) {
        const outboxId = result.rows[0].outbox_id;
        log.info(METHOD.INSERT_OUTBOX_ROW, LOG_MESSAGES.OUTBOX_EVENT_INSERTED, {
          recordId,
          applicationId,
          eventType,
          outboxId,
        }, LOG_EVENTS.OUTBOX_INSERTED);
        log.end(METHOD.INSERT_OUTBOX_ROW, { recordId, outboxId });
        return outboxId;
      }

      const existing = await client.query(applicationOutboxQueries.FIND_EXISTING_BY_IDEMPOTENCY_KEY, [idempotencyKey]);
      const existingOutboxId = existing.rows[0]?.outbox_id ?? null;
      log.info(METHOD.INSERT_OUTBOX_ROW, LOG_MESSAGES.OUTBOX_ALREADY_RECORDED, {
        recordId,
        applicationId,
        idempotencyKey,
        outboxId: existingOutboxId,
      }, LOG_EVENTS.OUTBOX_DUPLICATE);
      log.end(METHOD.INSERT_OUTBOX_ROW, { recordId, outboxId: existingOutboxId });
      return existingOutboxId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.INSERT_OUTBOX_ROW, LOG_MESSAGES.OUTBOX_INSERT_FAILED, {
        recordId,
        applicationId,
        error: message,
      }, LOG_EVENTS.OUTBOX_FAILED);
      throw new DatabaseError(`Failed to insert application_outbox event: ${message}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  },
};
