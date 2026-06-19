import {
  isValidTransition,
  deriveStatusFromEvents,
  canTransitionToTerminal,
  normalizePaymentStatusForStateMachine,
  mapStateToDbStatus,
  PaymentState,
  PaymentEventType,
} from './stateMachine.js';
import log from '../util/logger.js';
import type { Payment, PaymentEvent, GovUKPayWebhook, GovUKPayResource } from '../types/index.js';

interface ProcessContext {
  eventId: string;
  requestId: string;
}

interface ProcessResult {
  action: 'PROCESS' | 'DUPLICATE' | 'IGNORE';
  reason?: string;
  eventType?: string;
  allEvents?: string[];
  currentStatus?: PaymentState;
  finalStatus?: PaymentState;
  statusChanged?: boolean;
  processed?: boolean;
}

function normalizeEventType(govukPayEventType: string): string {
  const mapping: Record<string, string> = {
    card_payment_succeeded: 'payment.confirmed',
    card_payment_captured: 'payment.captured',
    card_payment_settled: 'payment.settled',
    card_payment_failed: 'payment.failed',
    card_payment_expired: 'payment.expired',
    card_payment_refunded: 'payment.refunded',
  };

  return mapping[govukPayEventType] || govukPayEventType;
}

export async function processPaymentEventWithOrdering(
  payment: Payment,
  allEvents: PaymentEvent[],
  newEvent: GovUKPayWebhook,
  context: ProcessContext
): Promise<ProcessResult> {
  const { eventId } = context;
  const rawEventType = newEvent.event_type;
  const newEventType = normalizeEventType(rawEventType);
  const currentStatus = normalizePaymentStatusForStateMachine(payment.status);

  const previousEvents = allEvents.filter((e) => e.event_id !== eventId);
  const processedRawEventTypes = previousEvents.map((e) => e.event_type);
  const processedNormalizedEventTypes = previousEvents
    .map((e) => normalizeEventType(e.event_type))
    .filter((t): t is string => Boolean(t));

  log.info('[eventProcessor] Processing event', {
    eventId,
    eventType: newEventType,
    rawEventType,
    currentStatus,
    allEventsSoFar: processedNormalizedEventTypes,
  });

  if (processedRawEventTypes.includes(rawEventType as PaymentEventType)) {
    log.info('[eventProcessor] Event type already processed', { rawEventType });
    return {
      action: 'DUPLICATE',
      reason: 'Event type already processed',
      processed: true,
    };
  }

  if (!isValidTransition(currentStatus, newEventType as PaymentEventType)) {
    if (!canTransitionToTerminal(currentStatus, newEventType as PaymentEventType)) {
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

  const eventTypesWithNew = [...processedNormalizedEventTypes, newEventType];
  const finalStatus = deriveStatusFromEvents(eventTypesWithNew);

  log.info('[eventProcessor] Status derivation', {
    allEvents: eventTypesWithNew,
    derivedStatus: finalStatus,
  });

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
 * Fields to update on public.payment (minimal — detail is in payment_events).
 */
export function extractEventData(
  finalStatus: PaymentState,
  resourceData: GovUKPayResource | undefined
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    status: mapStateToDbStatus(finalStatus),
  };

  if (resourceData) {
    if (resourceData.amount) updates.amount = resourceData.amount;
    if (resourceData.reference) updates.reference = resourceData.reference;
    if (resourceData.description) updates.description = resourceData.description;
    if (resourceData.state?.finished !== undefined) {
      updates.finished = resourceData.state.finished;
    }
  }

  if (['CONFIRMED', 'CAPTURED', 'SETTLED', 'REFUNDED'].includes(finalStatus)) {
    updates.finished = true;
  }

  return updates;
}
