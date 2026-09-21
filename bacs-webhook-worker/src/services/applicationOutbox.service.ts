import { createHash } from 'crypto';
import { paymentRepository, type InvoiceApplicationLookup } from '../repositories/payment.repository';
import { applicationOutboxRepository } from '../repositories/applicationOutbox.repository';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES, LOG_CHILD_DOMAIN, LOG_EVENTS } from '../constants/log.constants';
import { BACS_PAYMENT_EVENT_TYPE } from '../constants/applicationOutbox.constants';
import { mapUksbsStatusToPaymentStatus } from '../util/paymentStatus.mapper';
import type { ProcessablePayment } from '../types';
import type { BacsPaymentOutboxPayload } from '../types/applicationOutbox.types';

const log = createLogger('applicationOutbox.service.ts', LOG_CHILD_DOMAIN.OUTBOX_SERVICE);

const METHOD = {
  RECORD_BACS_PAYMENT_EVENT: 'recordBacsPaymentEvent',
} as const;

export function isApplicationOutboxEnabled(): boolean {
  // Enabled by default - set ENABLE_APPLICATION_OUTBOX=false to explicitly opt out.
  return process.env.ENABLE_APPLICATION_OUTBOX !== 'false';
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
  mappedStatus: string,
): BacsPaymentOutboxPayload {
  return {
    applicationId,
    event_type: BACS_PAYMENT_EVENT_TYPE,
    desnzReference,
    invoiceNumber,
    payment: {
      amount: payment.amount,
      currency: payment.currency,
      status: mappedStatus,
      bacsReference: payment.bacsReference ?? null,
      paymentReference: invoiceNumber,
      paymentDate: payment.paymentDate ?? null,
      receivedAt: payment.receivedAt,
    },
  };
}

export const applicationOutboxService = {
  /**
   * `invoiceLookup` is the same lookup worker.service.ts's processPayment()
   * already fetched (and required to be non-null) before calling this - reused
   * here rather than re-querying the invoice table a second time per webhook.
   */
  recordBacsPaymentEvent: async (
    payment: ProcessablePayment,
    invoiceLookup: InvoiceApplicationLookup,
    recordId: string,
  ): Promise<string | null> => {
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

    if (invoiceLookup.paymentMethod && invoiceLookup.paymentMethod.toUpperCase() !== 'BACS') {
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_INVOICE_PAYMENT_METHOD_MISMATCH, {
        recordId,
        invoiceNumber: invoiceLookup.invoiceNumber,
        paymentMethod: invoiceLookup.paymentMethod,
      });
    }

    const applicationId = invoiceLookup.applicationId;

    const mappedStatus = mapUksbsStatusToPaymentStatus(payment.status);
    if (!mappedStatus) {
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.PAYMENT_STATUS_UNMAPPED, {
        recordId,
        webhookId: payment.webhookId,
        uksbsStatus: payment.status,
      }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    const desnzReference = await paymentRepository.findDesnzReferenceByApplicationId(applicationId);
    if (!desnzReference) {
      // Downstream outbox consumers (e.g. Salesforce sync) expect desnzReference
      // populated - an event with it null is unusable to them, so skip the
      // insert entirely rather than writing a row they can't act on.
      log.warn(METHOD.RECORD_BACS_PAYMENT_EVENT, LOG_MESSAGES.OUTBOX_DESNZ_REF_LOOKUP_FAILED, {
        recordId,
        applicationId,
      }, LOG_EVENTS.OUTBOX_SKIPPED);
      log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId: null });
      return null;
    }

    const idempotencyKey = buildIdempotencyKey(applicationId, payment.transactionId, payment.webhookId, mappedStatus);
    const payload = buildBacsPaymentOutboxPayload(
      applicationId,
      desnzReference,
      invoiceLookup.invoiceNumber,
      payment,
      mappedStatus,
    );

    const outboxId = await applicationOutboxRepository.insertOutboxRow(
      { applicationId, eventType: BACS_PAYMENT_EVENT_TYPE, payload, idempotencyKey },
      recordId,
    );

    log.end(METHOD.RECORD_BACS_PAYMENT_EVENT, { recordId, outboxId });
    return outboxId;
  },
};
