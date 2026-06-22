import { SQSRecord, SQSBatchResponse, Context } from 'aws-lambda';
import { processPaymentEventWithOrdering, extractEventData } from '../stateManagement/eventProcessor.js';
import { updatePaymentWithOrdering, findByPaymentId, getPaymentEvents } from '../database/paymentRepository.js';
import { recordMetric } from '../util/metrics.js';
import { validateSignature } from '../validators/signatureValidator.js';
import { checkAndRecordIdempotency } from './idempotencyService.js';
import { beginTransaction, commitTransaction, rollbackTransaction } from '../util/database.js';
import log from '../util/logger.js';
import { getGovukPayWebhookSecret } from '../util/webhookSecret.js';
import {
  resolveWebhookEventData,
  resolveWebhookEventTimestamp,
} from '../util/webhookPayload.js';
import { markWebhookProcessed } from '../database/webhookRepository.js';
import {
  isApplicationOutboxEnabled,
  buildPaymentOutboxPayload,
  createPaymentStatusNotification,
} from '../database/applicationOutboxRepository.js';
import { mapEventType } from '../mappers/paymentEventMapper.js';
import {
  isGovPayApiValidationEnabled,
  validateWebhookWithGovPayApi,
} from '../validators/govPayApiValidator.js';
import type { SQSMessageBody, ProcessResult, GovUKPayWebhook, Payment } from '../types/index.js';

async function completeWebhookReconciliation(params: {
  eventId: string;
  payment: Payment;
  paymentId: string;
  rawEventType: string;
  normalizedEventType?: string;
  statusChanged?: boolean;
  newStatus?: string;
  allEvents?: string[];
}): Promise<void> {
  await markWebhookProcessed(params.eventId);

  if (
    !params.statusChanged ||
    !params.payment.application_id ||
    !isApplicationOutboxEnabled() ||
    !params.normalizedEventType
  ) {
    return;
  }

  const outboxEventType = mapEventType(params.normalizedEventType);
  const payloadJson = buildPaymentOutboxPayload({
    payment: params.payment,
    paymentId: params.paymentId,
    newStatus: params.newStatus ?? params.payment.status,
    outboxEventType,
    rawEventType: params.rawEventType,
    webhookId: params.eventId,
    eventHistory: params.allEvents,
  });

  const outboxId = await createPaymentStatusNotification({
    applicationId: params.payment.application_id,
    eventType: outboxEventType,
    payloadJson,
  });

  log.info('[paymentProcessor] application_outbox notification created', {
    outboxId,
    applicationId: params.payment.application_id,
    eventType: outboxEventType,
  });
}

/**
 * Process payment webhook from SQS message
 */
export async function processPaymentFromSQS(
  sqsMessage: SQSRecord,
  context: Context
): Promise<ProcessResult> {
  const requestId = context.awsRequestId;

  try {
    const messageBody: SQSMessageBody = JSON.parse(sqsMessage.body);
    const { webhook, metadata } = messageBody;

    const eventId = metadata.webhookId;
    const paymentId = metadata.paymentId;
    const eventType = metadata.eventType;
    const signature = metadata.signature;

    log.info('[paymentProcessor] Processing webhook from SQS', {
      eventId,
      paymentId,
      eventType,
      source: metadata.source,
      requestId,
    });

    if (metadata.source === 'inbound-event-receiver') {
      log.info('[paymentProcessor] Skipping signature validation - already validated by inbound receiver', {
        requestId,
        eventId,
      });
    } else {
      const webhookSecret = getGovukPayWebhookSecret();
      if (!signature || !webhookSecret) {
        log.error('[paymentProcessor] Signature validation failed: missing data', { requestId, eventId });
        recordMetric('payment.webhook.signature_missing', 1);
        throw new Error('Signature validation failed: missing signature or secret');
      }

      const webhookPayload = JSON.stringify(webhook);
      const isValidSignature = validateSignature(webhookPayload, signature, webhookSecret);

      if (!isValidSignature) {
        log.error('[paymentProcessor] Invalid webhook signature', {
          requestId,
          eventId,
          paymentId,
        });
        recordMetric('payment.webhook.signature_invalid', 1);
        throw new Error('Invalid webhook signature');
      }
    }

    if (isGovPayApiValidationEnabled()) {
      try {
        await validateWebhookWithGovPayApi({
          paymentId,
          webhookEventType: eventType,
          webhookAmount: webhook.resource?.amount,
        });
      } catch (govPayErr) {
        const govPayError = govPayErr as Error;
        log.error('[paymentProcessor] GOV.UK Pay API validation failed', {
          requestId,
          eventId,
          paymentId,
          error: govPayError.message,
        });
        recordMetric('payment.webhook.govpay_api_invalid', 1);
        throw govPayErr;
      }
    } else {
      log.info('[paymentProcessor] GOV.UK Pay API validation skipped', {
        requestId,
        eventId,
        reason: 'GOVPAY_API_VALIDATION_ENABLED=false',
      });
    }

    const eventTimestamp = resolveWebhookEventTimestamp(webhook, metadata);
    const eventData = resolveWebhookEventData(webhook);

    await beginTransaction();

    try {
      const idempotencyCheck = await checkAndRecordIdempotency(
        eventId,
        paymentId,
        eventType,
        eventData,
        eventTimestamp
      );

      if (idempotencyCheck.isDuplicate) {
        await rollbackTransaction();
        await markWebhookProcessed(eventId);
        log.info('[paymentProcessor] Duplicate event ignored', { eventId, paymentId });
        recordMetric('payment.webhook.duplicate', 1);
        return {
          action: 'DUPLICATE',
          reason: 'Event already processed',
          eventId,
        };
      }

      const payment = await findByPaymentId(paymentId);

      if (!payment) {
        throw new Error(
          `Payment not found for payment_id=${paymentId}. ` +
            'A row must exist in public.payment before webhook processing.'
        );
      }

      const allEvents = await getPaymentEvents(paymentId);

      const processResult = await processPaymentEventWithOrdering(
        payment,
        allEvents,
        webhook as GovUKPayWebhook,
        { eventId, requestId }
      );

      if (processResult.action === 'IGNORE') {
        await rollbackTransaction();
        log.info('[paymentProcessor] Out-of-order event — rolling back for SQS retry', {
          reason: processResult.reason,
          eventId,
          paymentId,
        });
        recordMetric(`payment.event.${processResult.action.toLowerCase()}`, 1);
        throw new Error(`Out-of-order webhook: ${processResult.reason ?? 'invalid transition'}`);
      }

      if (processResult.action === 'DUPLICATE') {
        await completeWebhookReconciliation({
          eventId,
          payment,
          paymentId,
          rawEventType: eventType,
        });
        await commitTransaction();
        log.info('[paymentProcessor] Event type already applied', {
          reason: processResult.reason,
        });
        recordMetric('payment.webhook.duplicate', 1);
        return processResult;
      }

      if (processResult.action !== 'PROCESS') {
        await rollbackTransaction();
        return processResult;
      }

      const updateData = extractEventData(
        processResult.finalStatus!,
        webhook.resource
      );

      const updated = await updatePaymentWithOrdering(paymentId, updateData);

      log.info('[paymentProcessor] Payment updated', {
        paymentId,
        oldStatus: payment.status,
        newStatus: updated.status,
        allEvents: processResult.allEvents,
      });

      await completeWebhookReconciliation({
        eventId,
        payment: updated,
        paymentId,
        rawEventType: eventType,
        normalizedEventType: processResult.eventType,
        statusChanged: processResult.statusChanged,
        newStatus: updated.status,
        allEvents: processResult.allEvents,
      });

      await commitTransaction();

      recordMetric('payment.webhook.processed', 1);
      recordMetric(`payment.webhook.${eventType}`, 1);
      recordMetric('payment.status', 1, updated.status);

      return {
        action: 'PROCESSED',
        payment: updated,
        statusChanged: processResult.statusChanged,
      };
    } catch (txError) {
      await rollbackTransaction();
      const error = txError as Error;
      log.error('[paymentProcessor] Transaction rolled back', {
        requestId,
        error: error.message,
        eventId,
        paymentId,
      });
      throw txError;
    }
  } catch (err) {
    const error = err as Error;
    log.error('[paymentProcessor] Error processing from SQS', {
      requestId,
      err,
      message: error.message,
      stack: error.stack,
    });
    recordMetric('payment.webhook.error', 1);
    throw err;
  }
}

export async function processSQSBatch(
  records: SQSRecord[],
  context: Context
): Promise<SQSBatchResponse> {
  log.info('[paymentProcessor] Processing SQS batch', {
    recordCount: records.length,
    requestId: context.awsRequestId,
  });

  const BUFFER_MS = 5000;
  const PARALLEL_LIMIT = 3;
  const batchItemFailures: { itemIdentifier: string }[] = [];

  try {
    for (let i = 0; i < records.length; i += PARALLEL_LIMIT) {
      const remainingTime = context.getRemainingTimeInMillis();
      if (remainingTime < BUFFER_MS) {
        log.warn('[paymentProcessor] Lambda timeout approaching, stopping batch processing', {
          recordIndex: i,
          remainingMs: remainingTime,
          requestId: context.awsRequestId,
        });

        for (let j = i; j < records.length; j++) {
          if (records[j]) {
            batchItemFailures.push({
              itemIdentifier: records[j]!.messageId,
            });
          }
        }
        break;
      }

      const batch = records.slice(i, Math.min(i + PARALLEL_LIMIT, records.length));
      const results = await Promise.allSettled(
        batch.map((record) => processPaymentFromSQS(record, context))
      );

      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          const error = result.reason as Error;
          log.error('[paymentProcessor] Record processing failed', {
            messageId: batch[idx]?.messageId,
            error: error?.message,
            requestId: context.awsRequestId,
          });
          batchItemFailures.push({
            itemIdentifier: batch[idx]?.messageId || '',
          });
        }
      });
    }

    log.info('[paymentProcessor] Batch processing complete', {
      total: records.length,
      successful: records.length - batchItemFailures.length,
      failed: batchItemFailures.length,
      requestId: context.awsRequestId,
    });

    return { batchItemFailures };
  } catch (err) {
    const error = err as Error;
    log.error('[paymentProcessor] Batch processing error', {
      error: error.message,
      requestId: context.awsRequestId,
    });
    throw err;
  }
}
