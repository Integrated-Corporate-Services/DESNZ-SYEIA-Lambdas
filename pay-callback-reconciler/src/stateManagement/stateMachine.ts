/**
 * Payment State Machine - Handles out-of-order event delivery
 * 
 * Event Types:
 * - payment.confirmed (✅ authorized)
 * - payment.captured (📦 funds captured)
 * - payment.settled (✅✅ settled to merchant)
 * - payment.failed (❌ declined)
 * - payment.expired (⏰ expired)
 * - payment.refunded (💳 refunded)
 */

export type PaymentState = 'INITIAL' | 'PENDING' | 'CONFIRMED' | 'CAPTURED' | 'SETTLED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
export type PaymentEventType = 'payment.confirmed' | 'payment.captured' | 'payment.settled' | 'payment.failed' | 'payment.expired' | 'payment.refunded';

const DB_STATUS_TO_STATE: Record<string, PaymentState> = {
  created: 'PENDING',
  pending: 'PENDING',
  initial: 'INITIAL',
  confirmed: 'CONFIRMED',
  captured: 'CAPTURED',
  settled: 'SETTLED',
  failed: 'FAILED',
  expired: 'EXPIRED',
  cancelled: 'EXPIRED',
  refunded: 'REFUNDED',
};

const STATE_TO_DB_STATUS: Record<PaymentState, string> = {
  INITIAL: 'created',
  PENDING: 'created',
  CONFIRMED: 'confirmed',
  CAPTURED: 'captured',
  SETTLED: 'settled',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
};

/**
 * Valid state transitions
 */
export const VALID_TRANSITIONS: Record<PaymentState, Partial<Record<PaymentEventType, boolean>>> = {
  // From INITIAL (no events yet)
  'INITIAL': {
    'payment.confirmed': true,
    'payment.failed': true,
    'payment.expired': true,
    'payment.captured': false,   // Must be confirmed first
    'payment.settled': false,    // Must be confirmed first
    'payment.refunded': false,   // Must be confirmed first
  },

  // From PENDING
  'PENDING': {
    'payment.confirmed': true,
    'payment.failed': true,
    'payment.expired': true,
    'payment.captured': false,
    'payment.settled': false,
    'payment.refunded': false,
  },

  // From CONFIRMED
  'CONFIRMED': {
    'payment.captured': true,
    'payment.settled': true,
    'payment.refunded': true,
    'payment.expired': false,    // Can't expire if confirmed
    'payment.failed': false,     // Can't fail if confirmed
  },

  // From CAPTURED
  'CAPTURED': {
    'payment.settled': true,
    'payment.refunded': true,
    'payment.confirmed': false,
    'payment.expired': false,
    'payment.failed': false,
  },

  // From SETTLED
  'SETTLED': {
    'payment.refunded': true,
    'payment.confirmed': false,
    'payment.captured': false,
    'payment.expired': false,
    'payment.failed': false,
  },

  // Terminal: FAILED (no transitions)
  'FAILED': {},

  // Terminal: EXPIRED (no transitions)
  'EXPIRED': {},

  // Terminal: REFUNDED (no transitions)
  'REFUNDED': {},
};

/** Map public.payment.status to internal state machine state */
export function normalizePaymentStatusForStateMachine(status: string | null | undefined): PaymentState {
  if (!status) return 'INITIAL';
  const mapped = DB_STATUS_TO_STATE[status.toLowerCase()];
  if (mapped) return mapped;
  const upper = status.toUpperCase() as PaymentState;
  return VALID_TRANSITIONS[upper] ? upper : 'PENDING';
}

/** Map internal state machine state to public.payment.status */
export function mapStateToDbStatus(state: PaymentState): string {
  return STATE_TO_DB_STATUS[state] ?? state.toLowerCase();
}

/**
 * Event type to status mapping
 */
export const EVENT_TO_STATUS: Record<PaymentEventType, PaymentState> = {
  'payment.confirmed': 'CONFIRMED',
  'payment.captured': 'CAPTURED',
  'payment.settled': 'SETTLED',
  'payment.failed': 'FAILED',
  'payment.expired': 'EXPIRED',
  'payment.refunded': 'REFUNDED',
};

/**
 * Validate if transition is allowed
 */
export function isValidTransition(currentStatus: PaymentState, eventType: PaymentEventType): boolean {
  const validEvents = VALID_TRANSITIONS[currentStatus] || {};
  return validEvents[eventType] === true;
}

/**
 * Derive final status from event history
 * Terminal states have highest priority
 */
export function deriveStatusFromEvents(eventTypes: string[]): PaymentState {
  // Terminal states (highest priority)
  if (eventTypes.includes('payment.failed')) return 'FAILED';
  if (eventTypes.includes('payment.expired')) return 'EXPIRED';
  if (eventTypes.includes('payment.refunded')) return 'REFUNDED';

  // Progressive states (priority order)
  if (eventTypes.includes('payment.settled')) return 'SETTLED';
  if (eventTypes.includes('payment.captured')) return 'CAPTURED';
  if (eventTypes.includes('payment.confirmed')) return 'CONFIRMED';

  return 'PENDING';
}

/**
 * Check if status is terminal (no further transitions)
 */
export function isTerminalStatus(status: PaymentState): boolean {
  return ['FAILED', 'EXPIRED', 'REFUNDED'].includes(status);
}

/**
 * Check if an event can proceed to terminal state
 */
export function canTransitionToTerminal(currentStatus: PaymentState, eventType: PaymentEventType): boolean {
  if (eventType === 'payment.failed') {
    // Failed can be reached from PENDING, CONFIRMED, CAPTURED, SETTLED
    return ['INITIAL', 'PENDING', 'CONFIRMED', 'CAPTURED', 'SETTLED'].includes(currentStatus);
  }
  
  if (eventType === 'payment.expired') {
    // Expired only valid from INITIAL/PENDING
    return ['INITIAL', 'PENDING'].includes(currentStatus);
  }

  if (eventType === 'payment.refunded') {
    // Refunded only valid from CONFIRMED, CAPTURED, SETTLED
    return ['CONFIRMED', 'CAPTURED', 'SETTLED'].includes(currentStatus);
  }

  return false;
}
