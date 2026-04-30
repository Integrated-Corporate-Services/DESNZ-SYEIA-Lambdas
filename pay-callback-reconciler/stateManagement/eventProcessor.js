import {
  isValidTransition,
  deriveStatusFromEvents,
  canTransitionToTerminal,
} from './stateMachine.js';
import log from '../util/logger.js';

/**
 * Map GOV.UK Pay event types to internal event types
 */
function normalizeEventType(govukPayEventType) {
  const mapping = {
    'card_payment_succeeded': 'payment.confirmed',
    'card_payment_captured': 'payment.captured',
    'card_payment_settled': 'payment.settled',
    'card_payment_failed': 'payment.failed',
    'card_payment_expired': 'payment.expired',
    'card_payment_refunded': 'payment.refunded',
  };
  
  return mapping[govukPayEventType] || govukPayEventType;
}

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
  const rawEventType = newEvent.event_type;
  const newEventType = normalizeEventType(rawEventType);
  const currentStatus = payment.status || 'INITIAL';

  // Filter out the current event (just inserted by idempotency check) from the list
  const previousEvents = allEvents.filter(e => e.event_id !== eventId);
  
  // Get all RAW event types already processed (for duplicate detection)
  const processedRawEventTypes = previousEvents.map(e => e.event_type);
  // Get normalized event types (for state machine logic)
  const processedNormalizedEventTypes = previousEvents.map(e => normalizeEventType(e.event_type));

  log.info('[eventProcessor] Processing event', {
    eventId,
    eventType: newEventType,
    rawEventType,
    currentStatus,
    allEventsSoFar: processedNormalizedEventTypes,
  });

  // 1. Check if already processed using RAW event type (idempotency at type level)
  // Note: event_id level idempotency is already handled by idempotencyService
  // This check prevents processing the same event TYPE twice (e.g., two different card_payment_succeeded events)
  if (processedRawEventTypes.includes(rawEventType)) {
    log.info('[eventProcessor] Event type already processed', { rawEventType });
    return {
      action: 'DUPLICATE',
      reason: 'Event type already processed',
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
  const eventTypesWithNew = [...processedNormalizedEventTypes, newEventType];
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
export function extractEventData(eventType, resourceData) {
  const updates = {
    last_event_type: eventType,
    last_event_at: new Date(),
  };

  // Extract common fields from GOV.UK Pay resource
  if (resourceData) {
    if (resourceData.amount) updates.amount = resourceData.amount;
    if (resourceData.reference) updates.reference = resourceData.reference;
    if (resourceData.description) updates.description = resourceData.description;
  }

  switch (eventType) {
    case 'payment.confirmed':
      updates.confirmed_at = new Date();
      if (resourceData?.payment_id) updates.transaction_id = resourceData.payment_id;
      break;

    case 'payment.captured':
      updates.captured_at = new Date();
      if (resourceData?.amount) updates.capture_amount = resourceData.amount;
      break;

    case 'payment.settled':
      updates.settled_at = new Date();
      if (resourceData?.amount) updates.settled_amount = resourceData.amount;
      break;

    case 'payment.failed':
      updates.failed_at = new Date();
      if (resourceData?.state?.message) updates.failure_reason = resourceData.state.message;
      if (resourceData?.state?.code) updates.failure_code = resourceData.state.code;
      break;

    case 'payment.expired':
      updates.expired_at = new Date();
      break;

    case 'payment.refunded':
      updates.refunded_at = new Date();
      if (resourceData?.refund_summary?.amount_available) {
        updates.refund_amount = resourceData.refund_summary.amount_available;
      }
      break;
  }

  return updates;
}
