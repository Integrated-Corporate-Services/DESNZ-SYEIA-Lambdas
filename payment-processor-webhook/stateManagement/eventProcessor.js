import {
  isValidTransition,
  deriveStatusFromEvents,
  canTransitionToTerminal,
} from './stateMachine.js';
import log from '../util/logger.js';

/**
 * Process payment event with out-of-order resilience
 */
export async function processPaymentEventWithOrdering(
  payment,
  allEvents,
  newEvent,
  context
) {
  const { eventId } = context;
  const newEventType = newEvent.type;
  const currentStatus = payment.status || 'INITIAL';

  // Get all event types already processed
  const processedEventTypes = allEvents.map(e => e.event_type);

  log.info('[eventProcessor] Processing event', {
    eventId,
    eventType: newEventType,
    currentStatus,
    allEventsSoFar: processedEventTypes,
  });

  // 1. Check if already processed (idempotency)
  if (processedEventTypes.includes(newEventType)) {
    log.info('[eventProcessor] Event already processed', { newEventType });
    return {
      action: 'DUPLICATE',
      reason: 'Event already processed',
      processed: true,
    };
  }

  // 2. Validate transition
  if (!isValidTransition(currentStatus, newEventType)) {
    // Try terminal state transitions
    if (!canTransitionToTerminal(currentStatus, newEventType)) {
      log.warn('[eventProcessor] Invalid transition', {
        current: currentStatus,
        attempting: newEventType,
      });
      return {
        action: 'IGNORE',
        reason: 'Invalid state transition',
      };
    }
  }

  // 3. Calculate final status if we add this event
  const eventTypesWithNew = [...processedEventTypes, newEventType];
  const finalStatus = deriveStatusFromEvents(eventTypesWithNew);

  log.info('[eventProcessor] Status derivation', {
    allEvents: eventTypesWithNew,
    derivedStatus: finalStatus,
  });

  // 4. Check if status will change
  const statusChanged = finalStatus !== currentStatus;

  return {
    action: 'PROCESS',
    eventType: newEventType,
    allEvents: eventTypesWithNew,
    currentStatus,
    finalStatus,
    statusChanged,
  };
}

/**
 * Extract event-specific data for database update
 */
export function extractEventData(eventType, eventData) {
  const updates = {
    last_event_type: eventType,
    last_event_at: new Date(),
  };

  switch (eventType) {
    case 'payment.confirmed':
      updates.confirmed_at = new Date();
      updates.transaction_id = eventData.trans_id;
      break;

    case 'payment.captured':
      updates.captured_at = new Date();
      updates.capture_amount = eventData.amount;
      break;

    case 'payment.settled':
      updates.settled_at = new Date();
      updates.settled_amount = eventData.amount;
      break;

    case 'payment.failed':
      updates.failed_at = new Date();
      updates.failure_reason = eventData.failure_reason;
      updates.failure_code = eventData.error_code;
      break;

    case 'payment.expired':
      updates.expired_at = new Date();
      break;

    case 'payment.refunded':
      updates.refunded_at = new Date();
      updates.refund_amount = eventData.refund_amount;
      break;
  }

  return updates;
}
