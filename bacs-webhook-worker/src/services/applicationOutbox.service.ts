import { createHash } from 'crypto';
import { paymentRepository } from '../repositories/payment.repository';
import { applicationOutboxRepository } from '../repositories/applicationOutbox.repository';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES, LOG_CHILD_DOMAIN, LOG_EVENTS } from '../constants/log.constants';
import { BACS_PAYMENT_EVENT_TYPE } from '../constants/applicationOutbox.constants';
import type { ProcessablePayment } from '../types';
import type { BacsPaymentOutboxPayload } from '../types/applicationOutbox.types';

const log = createLogger('applicationOutbox.service.ts', LOG_CHILD_DOMAIN.OUTBOX_SERVICE);

const METHOD = {
  RECORD_BACS_PAYMENT_EVENT: 'recordBacsPaymentEvent',
} as const;

export function isApplicationOutboxEnabled(): boolean {
  return process.env.ENABLE_APPLICATION_OUTBOX === 'true';
}

function buildIdempotencyKey(applicationId: string, transactionId: string, webhookId: string, status: string): string {
  return createHash('sha256')
    .update(`${BACS_PAYMENT_EVENT_TYPE}|${applicationId}|${transactionId}|${webhookId}|${status}`)
    .digest('hex');
}

function buildBacsPaymentOutboxPayload(
  applicationId: string,
  desnzReference: string | null,
  invoiceNumber: string,
  payment: ProcessablePayment,
): BacsPaymentOutboxPayload {
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

export const applicationOutboxService = {
  recordBacsPaymentEvent: async (payment: ProcessablePayment, recordId: string): Promise<string | null> => {
    log.start(METHOD.RECORD_BACS_PAYMENT_EVENT, {
      recordId,
      webhookId: payment.webhookId,
      paymentId: payment.paymentId,
    });

    if (!isApplicationOutboxEnabled()) {
      log.info(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_DISABLED, { recordId }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    if (!payment.paymentId) {
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_MISSING_APPLICATION_ID, {
        recordId,
        webhookId: payment.webhookId,
      }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    const invoiceLookup = await paymentRepository.findApplicationByInvoiceNumber(payment.transactionId);
    if (!invoiceLookup) {
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_INVOICE_LOOKUP_FAILED, {
        recordId,
        webhookId: payment.webhookId,
        paymentId: payment.paymentId,
        invoiceNumber: payment.transactionId,
      }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    if (invoiceLookup.paymentMethod && invoiceLookup.paymentMethod.toUpperCase() !== 'BACS') {
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_INVOICE_PAYMENT_METHOD_MISMATCH, {
        recordId,
        invoiceNumber: invoiceLookup.invoiceNumber,
        paymentMethod: invoiceLookup.paymentMethod,
      });
    }

    const applicationId = invoiceLookup.applicationId;

    const desnzReference = await paymentRepository.findDesnzReferenceByApplicationId(applicationId);
    if (!desnzReference) {
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_DESNZ_REF_LOOKUP_FAILED, { recordId, applicationId });
    }

    const idempotencyKey = buildIdempotencyKey(applicationId, payment.transactionId, payment.webhookId, payment.status);
    const payload = buildBacsPaymentOutboxPayload(applicationId, desnzReference, invoiceLookup.invoiceNumber, payment);

    const outboxId = await applicationOutboxRepository.insertOutboxRow(
      { applicationId, eventType: BACS_PAYMENT_EVENT_TYPE, payload, idempotencyKey },
      recordId,
    );

    log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId });
    return outboxId;
  },
};
