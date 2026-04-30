/**
 * Payment State Machine - Handles out-of-order event delivery
 * 
 * Event Types:
 * - payment.confirmed (âœ… authorized)
 * - payment.captured (ðŸ“¦ funds captured)
 * - payment.settled (âœ…âœ… settled to merchant)
 * - payment.failed (âŒ declined)
 * - payment.expired (â° expired)
 * - payment.refunded (ðŸ’³ refunded)
 */

/**
 * Valid state transitions
 */
export const VALID_TRANSITIONS = {
  // From INITIAL (no events yet)
  'INITIAL': {
    'payment.confirmed': true,
    'payment.failed': true,
    'payment.expired': true,
    'payment.captured': false,   // Must be confirmed first
    'payment.settled': false,    // Must be confirmed first
    'payment.refunded': false,   // Must be confirmed first
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

/**
 * Event type to status mapping
 */
export const EVENT_TO_STATUS = {
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
export function isValidTransition(currentStatus, eventType) {
  const validEvents = VALID_TRANSITIONS[currentStatus] || {};
  return validEvents[eventType] === true;
}

/**
 * Derive final status from event history
 * Terminal states have highest priority
 */
export function deriveStatusFromEvents(eventTypes) {
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
export function isTerminalStatus(status) {
  return ['FAILED', 'EXPIRED', 'REFUNDED'].includes(status);
}

/**
 * Check if an event can proceed to terminal state
 */
export function canTransitionToTerminal(currentStatus, eventType) {
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

  return true;
}
