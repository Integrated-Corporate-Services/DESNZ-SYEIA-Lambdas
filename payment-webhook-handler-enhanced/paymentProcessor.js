import { processPaymentEventWithOrdering, extractEventData } from './stateManagement/eventProcessor.js';
import { updatePaymentWithOrdering, findByGovukPayId, getPaymentEvents } from './database/paymentRepository.js';
import { createOutboxRecord } from './database/outboxRepository.js';
import { recordMetric } from './util/metrics.js';
import log from './util/logger.js';

/**
 * Enhanced payment processor for out-of-order events
 */
export async function processPayment(payload, context) {
  const { eventId } = context;
  const govukPayId = payload.data.id;

  log.info('[paymentProcessor] Processing payment', { eventId, govukPayId });

  try {
    // 1. Find existing payment
    const payment = await findByGovukPayId(govukPayId);
    
    if (!payment) {
      log.warn('[paymentProcessor] Payment not found', { govukPayId });
      recordMetric('payment.not_found', 1);
      return { action: 'IGNORE', reason: 'Payment not found' };
    }

    // 2. Get all existing events
    const allEvents = await getPaymentEvents(govukPayId);

    // 3. Process event with state machine
    const processResult = await processPaymentEventWithOrdering(
      payment,
      allEvents,
      payload,
      context
    );

    if (processResult.action !== 'PROCESS') {
      log.info('[paymentProcessor] Event not processed', {
        action: processResult.action,
        reason: processResult.reason,
      });
      recordMetric(`payment.event.${processResult.action.toLowerCase()}`, 1);
      return processResult;
    }

    // 4. Extract event-specific data
    const eventData = extractEventData(payload.type, payload.data);

    // 5. Update payment with new status and event history
    const updateData = {
      status: processResult.finalStatus,
      event_history: processResult.allEvents,
      event_count: processResult.allEvents.length,
      ...eventData,
    };

    const updated = await updatePaymentWithOrdering(govukPayId, updateData);

    log.info('[paymentProcessor] Payment updated', {
      govukPayId,
      oldStatus: payment.status,
      newStatus: updated.status,
      allEvents: processResult.allEvents,
    });

    // 6. Create outbox job for downstream systems (if status changed)
    if (processResult.statusChanged) {
      await createOutboxRecord({
        aggregate_id: payment.application_id,
        aggregate_type: 'Payment',
        event_type: `PAYMENT_${updated.status}`,
        payload_snapshot_json: JSON.stringify({
          paymentId: payment.id,
          govukPayId: payment.govuk_pay_id,
          status: updated.status,
          eventHistory: processResult.allEvents,
          eventTimestamp: new Date().toISOString(),
        }),
        created_at: new Date(),
      });

      log.info('[paymentProcessor] Outbox job created for status change', {
        paymentId: payment.id,
        newStatus: updated.status,
      });
    }

    // 7. Record metrics
    recordMetric('payment.webhook.processed', 1);
    recordMetric(`payment.webhook.${payload.type}`, 1);
    recordMetric('payment.status', 1, updated.status);

    return {
      action: 'PROCESSED',
      payment: updated,
      statusChanged: processResult.statusChanged,
    };

  } catch (err) {
    log.error('[paymentProcessor] Error', { eventId, err });
    recordMetric('payment.webhook.error', 1);
    throw err;
  }
}
