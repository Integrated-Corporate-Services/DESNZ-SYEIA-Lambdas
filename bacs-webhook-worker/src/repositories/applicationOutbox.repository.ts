import { createHash } from 'crypto';
import { getPool, paymentRepository } from './payment.repository';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES, LOG_CHILD_DOMAIN, LOG_EVENTS } from '../constants/log.constants';
import { applicationOutboxQueries } from '../queries/applicationOutbox.queries';
import { BACS_PAYMENT_EVENT_TYPE } from '../constants/applicationOutbox.constants';
import { DatabaseError } from '../errors/worker.errors';
import type { ProcessablePayment } from '../types';

const log = createLogger('applicationOutbox.repository.ts', LOG_CHILD_DOMAIN.OUTBOX_REPOSITORY);

const METHOD = {
  INSERT_BACS_PAYMENT_EVENT: 'insertBacsPaymentEvent',
} as const;

export function isApplicationOutboxEnabled(): boolean {
  return process.env.ENABLE_APPLICATION_OUTBOX === 'true';
}

function buildIdempotencyKey(
  applicationId: string,
  transactionId: string,
  webhookId: string,
  status: string
): string {
  return createHash('sha256')
    .update(`${BACS_PAYMENT_EVENT_TYPE}|${applicationId}|${transactionId}|${webhookId}|${status}`)
    .digest('hex');
}

function buildBacsPaymentOutboxPayload(
  applicationId: string,
  desnzReference: string | null,
  invoiceNumber: string,
  payment: ProcessablePayment
): Record<string, unknown> {
  return {
    applicationId,
    event_type: BACS_PAYMENT_EVENT_TYPE,
    desnzReference,
    invoiceNumber,
    payment: {
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      bacsReference: payment.bacsReference ?? null,
      paymentReference: invoiceNumber,
      paymentDate: payment.paymentDate ?? null,
      receivedAt: payment.receivedAt,
    },
  };
}


export const applicationOutboxRepository = {
  insertBacsPaymentEvent: async (payment: ProcessablePayment, recordId: string): Promise<string | null> => {
    log.start(METHOD.INSERT_BACS_PAYMENT_EVENT, {
      recordId,
      webhookId: payment.webhookId,
      paymentId: payment.paymentId,
    });

    if (!isApplicationOutboxEnabled()) {
      log.info(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_DISABLED, { recordId }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    if (!payment.paymentId) {
      log.warn(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_MISSING_APPLICATION_ID, {
        recordId,
        webhookId: payment.webhookId,
      }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    const invoiceLookup = await paymentRepository.findApplicationByInvoiceNumber(payment.transactionId);
    if (!invoiceLookup) {
      log.warn(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_INVOICE_LOOKUP_FAILED, {
        recordId,
        webhookId: payment.webhookId,
        paymentId: payment.paymentId,
        invoiceNumber: payment.transactionId,
      }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    if (invoiceLookup.paymentMethod && invoiceLookup.paymentMethod.toUpperCase() !== 'BACS') {
      log.warn(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_INVOICE_PAYMENT_METHOD_MISMATCH, {
        recordId,
        invoiceNumber: invoiceLookup.invoiceNumber,
        paymentMethod: invoiceLookup.paymentMethod,
      });
    }

    const applicationId = invoiceLookup.applicationId;

    const desnzReference = await paymentRepository.findDesnzReferenceByApplicationId(applicationId);
    if (!desnzReference) {
      log.warn(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_DESNZ_REF_LOOKUP_FAILED, {
        recordId,
        applicationId,
      });
    }

    const idempotencyKey = buildIdempotencyKey(applicationId, payment.transactionId, payment.webhookId, payment.status);

    try {
      const client = await getPool().connect();
      try {
        const payloadJson = buildBacsPaymentOutboxPayload(applicationId, desnzReference, invoiceLookup.invoiceNumber, payment);
        const result = await client.query(applicationOutboxQueries.INSERT_BACS_PAYMENT_EVENT, [
          applicationId,
          BACS_PAYMENT_EVENT_TYPE,
          JSON.stringify(payloadJson),
          idempotencyKey,
        ]);

        if (result.rows.length === 0) {
          const existing = await client.query(applicationOutboxQueries.FIND_EXISTING_BY_IDEMPOTENCY_KEY, [idempotencyKey]);
          const outboxId = existing.rows[0]?.outbox_id ?? null;
          log.info(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_ALREADY_RECORDED, {
            recordId,
            applicationId,
            idempotencyKey,
            outboxId,
          }, LOG_EVENTS.OUTBOX_DUPLICATE);
          log.end(METHOD.INSERT_BACS_PAYMENT_EVENT, { recordId, outboxId });
          return outboxId;
        }

        const outboxId = result.rows[0]?.outbox_id ?? null;
        log.info(METHOD.INSERT_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_EVENT_INSERTED, {
          recordId,
          applicationId,
          webhookId: payment.webhookId,
          transactionId: payment.transactionId,
          eventType: BACS_PAYMENT_EVENT_TYPE,
          outboxId,
        }, LOG_EVENTS.OUTBOX_INSERTED);
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
      }, LOG_EVENTS.OUTBOX_FAILED);
      throw new DatabaseError(`Failed to insert application_outbox event: ${message}`);
    }
  },
};
