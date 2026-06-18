import { SQSRecord, SQSBatchResponse, Context } from 'aws-lambda';
import { processPaymentEventWithOrdering, extractEventData } from '../stateManagement/eventProcessor.js';
import { updatePaymentWithOrdering, findByGovukPayId, getPaymentEvents, createPayment } from '../database/paymentRepository.js';
import { createOutboxRecord } from '../database/outboxRepository.js';
import { recordMetric } from '../util/metrics.js';
import { validateSignature } from '../validators/signatureValidator.js';
import { checkAndRecordIdempotency } from './idempotencyService.js';
import { beginTransaction, commitTransaction, rollbackTransaction } from '../util/database.js';
import log from '../util/logger.js';
import { getGovukPayWebhookSecret } from '../util/webhookSecret.js';
import type { SQSMessageBody, ProcessResult } from '../types/index.js';

/**
 * Process payment webhook from SQS message
 * Lambda is triggered by SQS event source mapping from backend
 * Now with transactions, signature validation, and proper idempotency
 */
export async function processPaymentFromSQS(
  sqsMessage: SQSRecord, 
  context: Context
): Promise<ProcessResult> {
  const requestId = context.awsRequestId;

  try {
    // Parse SQS message body
    const messageBody: SQSMessageBody = JSON.parse(sqsMessage.body);
    const { webhook, metadata } = messageBody;
    
    const eventId = metadata.webhookId;
    const govukPayId = metadata.paymentId;
    const eventType = metadata.eventType;
    const signature = metadata.signature;

    log.info('[paymentProcessor] Processing webhook from SQS', { 
      eventId, 
      govukPayId,
      eventType,
      source: metadata.source,
      requestId 
    });

    // 1. Validate signature (skip if already validated by inbound-event-receiver)
    if (metadata.source === 'inbound-event-receiver') {
      log.info('[paymentProcessor] Skipping signature validation - already validated by inbound receiver', { 
        requestId, 
        eventId 
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
          govukPayId
        });
        recordMetric('payment.webhook.signature_invalid', 1);
        throw new Error('Invalid webhook signature');
      }
    }

    log.debug('[paymentProcessor] Signature validated', { eventId });

    // 2. Check idempotency BEFORE processing (race condition safe)
    const eventTimestamp = webhook.timestamp || new Date().toISOString();
    const idempotencyCheck = await checkAndRecordIdempotency(
      eventId, 
      govukPayId, 
      eventType, 
      webhook.data,
      eventTimestamp
    );

    if (idempotencyCheck.isDuplicate) {
      log.info('[paymentProcessor] Duplicate event ignored', { eventId, govukPayId });
      recordMetric('payment.webhook.duplicate', 1);
      return { 
        action: 'DUPLICATE', 
        reason: 'Event already processed',
        eventId 
      };
    }

    // 3. Start database transaction
    await beginTransaction();

    try {
      // 4. Find existing payment (with row lock) or create if not found
      let payment = await findByGovukPayId(govukPayId);
      
      if (!payment) {
        log.info('[paymentProcessor] Payment not found - creating new payment', { govukPayId });
        
        // Extract initial data from webhook
        const initialData = {
          reference: webhook.resource?.reference || null,
          amount: webhook.resource?.amount || null,
          status: 'pending' as const,
          description: webhook.resource?.description || null
        };
        
        payment = await createPayment(govukPayId, initialData);
        log.info('[paymentProcessor] Payment created', { govukPayId, paymentId: payment.id });
        recordMetric('payment.created', 1);
      }

      // 5. Get all existing events
      const allEvents = await getPaymentEvents(govukPayId);

      // 6. Process event with state machine
      const processResult = await processPaymentEventWithOrdering(
        payment,
        allEvents,
        webhook,
        { eventId, requestId }
      );

      if (processResult.action !== 'PROCESS') {
        await rollbackTransaction();
        log.info('[paymentProcessor] Event not processed', {
          action: processResult.action,
          reason: processResult.reason,
        });
        recordMetric(`payment.event.${processResult.action.toLowerCase()}`, 1);
        return processResult;
      }

      // 7. Extract event-specific data (use normalized event type from processResult)
      const eventData = extractEventData(processResult.eventType || '', webhook.resource);

      // 8. Update payment with new status and event history
      // Convert PaymentState (UPPERCASE) to PaymentStatus (lowercase)
      const statusToUpdate = processResult.finalStatus?.toLowerCase() as any;
      
      const updateData = {
        status: statusToUpdate,
        event_history: processResult.allEvents || [],
        event_count: processResult.allEvents?.length || 0,
        ...eventData,
      };

      const updated = await updatePaymentWithOrdering(govukPayId, updateData);

      log.info('[paymentProcessor] Payment updated', {
        govukPayId,
        oldStatus: payment.status,
        newStatus: updated.status,
        allEvents: processResult.allEvents,
      });

      // 9. Create outbox job for downstream systems (if status changed)
      if (processResult.statusChanged) {
        await createOutboxRecord({
          aggregate_id: govukPayId,
          aggregate_type: 'Payment',
          event_type: `PAYMENT_${updated.status}`,
          payload_snapshot_json: JSON.stringify({
            paymentId: updated.id,
            govukPayId: updated.govuk_pay_id,
            status: updated.status,
            eventHistory: processResult.allEvents,
            eventTimestamp: new Date().toISOString(),
          }),
          created_at: new Date(),
        });

        log.info('[paymentProcessor] Outbox job created for status change', {
          paymentId: updated.id,
          newStatus: updated.status,
        });
      }

      // 10. Commit transaction - all operations succeeded
      await commitTransaction();

      // 11. Record metrics
      recordMetric('payment.webhook.processed', 1);
      recordMetric(`payment.webhook.${webhook.type}`, 1);
      recordMetric('payment.status', 1, updated.status);

      return {
        action: 'PROCESSED',
        payment: updated,
        statusChanged: processResult.statusChanged,
      };

    } catch (txError) {
      // Rollback transaction on any error
      await rollbackTransaction();
      const error = txError as Error;
      log.error('[paymentProcessor] Transaction rolled back', { 
        requestId,
        error: error.message,
        eventId,
        govukPayId
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

/**
 * Process batch of SQS messages with timeout handling
 * Lambda can receive up to 10 messages in a batch
 * Processes with limited parallelism to avoid overwhelming database
 */
export async function processSQSBatch(
  records: SQSRecord[], 
  context: Context
): Promise<SQSBatchResponse> {
  log.info('[paymentProcessor] Processing SQS batch', { 
    recordCount: records.length,
    requestId: context.awsRequestId,
  });

  const BUFFER_MS = 5000; // 5 second buffer before timeout
  const PARALLEL_LIMIT = 3; // Process 3 records at a time
  const batchItemFailures: { itemIdentifier: string }[] = [];

  try {
    for (let i = 0; i < records.length; i += PARALLEL_LIMIT) {
      // Check remaining time before processing each batch
      const remainingTime = context.getRemainingTimeInMillis();
      if (remainingTime < BUFFER_MS) {
        log.warn('[paymentProcessor] Lambda timeout approaching, stopping batch processing', {
          recordIndex: i,
          remainingMs: remainingTime,
          requestId: context.awsRequestId,
        });
        
        // Return remaining records as failures for SQS to retry
        for (let j = i; j < records.length; j++) {
          if (records[j]) {
            batchItemFailures.push({
              itemIdentifier: records[j]!.messageId
            });
          }
        }
        break;
      }

      // Process batch of records in parallel
      const batch = records.slice(i, Math.min(i + PARALLEL_LIMIT, records.length));
      const results = await Promise.allSettled(
        batch.map(record => processPaymentFromSQS(record, context))
      );

      // Collect failures
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          const error = result.reason as Error;
          log.error('[paymentProcessor] Record processing failed', {
            messageId: batch[idx]?.messageId,
            error: error?.message,
            requestId: context.awsRequestId,
          });
          batchItemFailures.push({
            itemIdentifier: batch[idx]?.messageId || ''
          });
        }
      });
    }

    const successful = records.length - batchItemFailures.length;
    const failed = batchItemFailures.length;

    log.info('[paymentProcessor] Batch processing complete', {
      total: records.length,
      successful,
      failed,
      requestId: context.awsRequestId,
    });

    // Return partial batch failure response
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
