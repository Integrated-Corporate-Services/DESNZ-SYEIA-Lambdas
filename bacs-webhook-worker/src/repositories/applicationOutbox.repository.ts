import { createHash } from 'crypto';
import { getPool } from './payment.repository';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import { applicationOutboxQueries } from '../queries/applicationOutbox.queries';
import { BACS_PAYMENT_EVENT_TYPE } from '../constants/applicationOutbox.constants';
import { DatabaseError } from '../errors/worker.errors';
import type { ProcessablePayment } from '../types';

const log = createLogger('applicationOutbox.repository.ts');

const METHOD = {
  INSERT_BACS_PAYMENT_EVENT: 'insertBacsPaymentEvent',
} as const;

export function isApplicationOutboxEnabled(): boolean {
  return process.env.ENABLE_APPLICATION_OUTBOX === 'true';
}

function buildIdempotencyKey(applicationId: string, transactionId: string): string {
  return createHash('sha256')
    .update(`${BACS_PAYMENT_EVENT_TYPE}|${applicationId}|${transactionId}`)
    .digest('hex');
}

function buildBacsPaymentOutboxPayload(payment: ProcessablePayment, recordId: string): Record<string, unknown> {
  return {
    applicationId: payment.paymentId,
    event_type: BACS_PAYMENT_EVENT_TYPE,
    metadata: {
      source: 'payment-service',
      channel: 'bacs-webhook-worker',
      schemaVersion: 1,
    },
    payment: {
      recordId,
      webhookId: payment.webhookId,
      paymentId: payment.paymentId,
      transactionId: payment.transactionId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      bacsReference: payment.bacsReference,
      eventType: payment.eventType,
      correlationId: payment.correlationId,
      receivedAt: payment.receivedAt,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Inserts a BACS_PAYMENT_EVENT row into the shared `application_outbox` table as soon as the
 * payment has been recorded and the webhook marked processed, so downstream consumers
 * (e.g. Salesforce sync) can pick it up. Mirrors the pattern used by:
 *  - desnz-syeia-backend-beta/src/services/withdrawalService.js (insertWithdrawalRequestedOutboxEvent)
 *  - payment-service/DESNZ-SYEIA-Lambdas/pay-callback-reconciler (applicationOutboxRepository.ts)
 */
export const applicationOutboxRepository = {
  insertBacsPaymentEvent: async (payment: ProcessablePayment, recordId: string): Promise<string | null> => {
    log.start(METHOD.INSERT_BACS_PAYMENT_EVENT, {
      recordId,
      webhookId: payment.webhookId,
      applicationId: payment.paymentId,
    });

    if (!isApplicationOutboxEnabled()) {
      log.info(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_DISABLED, { recordId });
      log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    const applicationId = payment.paymentId;
    if (!applicationId) {
      log.warn(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_MISSING_APPLICATION_ID, {
        recordId,
        webhookId: payment.webhookId,
      });
      log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    const idempotencyKey = buildIdempotencyKey(applicationId, payment.transactionId);

    try {
      const client = await getPool().connect();
      try {
        const existing = await client.query(applicationOutboxQueries.findExistingByIdempotencyKey, [idempotencyKey]);
        if (existing.rows.length > 0) {
          log.info(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_ALREADY_RECORDED, {
            recordId,
            applicationId,
            idempotencyKey,
            outboxId: existing.rows[0].outbox_id,
          });
          log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId: existing.rows[0].outbox_id });
          return existing.rows[0].outbox_id;
        }

        const payloadJson = buildBacsPaymentOutboxPayload(payment, recordId);
        const result = await client.query(applicationOutboxQueries.insertBacsPaymentEvent, [
          applicationId,
          BACS_PAYMENT_EVENT_TYPE,
          JSON.stringify(payloadJson),
          idempotencyKey,
        ]);

        const outboxId = result.rows[0]?.outbox_id ?? null;
        log.info(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_EVENT_INSERTED, {
          recordId,
          applicationId,
          webhookId: payment.webhookId,
          transactionId: payment.transactionId,
          eventType: BACS_PAYMENT_EVENT_TYPE,
          outboxId,
        });
        log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId });
        return outboxId;
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_INSERT_FAILED, {
        recordId,
        applicationId,
        error: message,
      });
      throw new DatabaseError(`Failed to insert application_outbox event: ${message}`);
    }
  },
};
