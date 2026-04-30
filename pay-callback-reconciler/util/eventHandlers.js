/**
 * GOV.UK Pay Event Handlers - For Reference
 * All events are actually handled by the state machine in eventProcessor.js
 */

/**
 * payment.confirmed
 * Payment has been authorized and confirmed
 * Next possible events: captured, settled, refunded, failed
 */
export function handlePaymentConfirmed(data) {
  return {
    eventType: 'payment.confirmed',
    action: 'CONFIRM_PAYMENT',
    details: {
      paymentId: data.id,
      amount: data.amount,
      transactionId: data.trans_id,
      email: data.email,
    },
  };
}

/**
 * payment.captured
 * Payment funds have been captured from customer
 * Only happens after payment.confirmed
 * Next possible events: settled, refunded
 */
export function handlePaymentCaptured(data) {
  return {
    eventType: 'payment.captured',
    action: 'CAPTURE_PAYMENT',
    details: {
      paymentId: data.id,
      capturedAmount: data.amount,
    },
  };
}

/**
 * payment.settled
 * Payment funds have been settled into merchant account
 * Usually 24-48 hours after capture
 * Next possible events: refunded
 */
export function handlePaymentSettled(data) {
  return {
    eventType: 'payment.settled',
    action: 'SETTLE_PAYMENT',
    details: {
      paymentId: data.id,
      settledAmount: data.amount,
    },
  };
}

/**
 * payment.failed
 * Payment processing failed (card declined, etc.)
 * Terminal state - no further events
 */
export function handlePaymentFailed(data) {
  return {
    eventType: 'payment.failed',
    action: 'MARK_FAILED',
    details: {
      paymentId: data.id,
      failureReason: data.failure_reason,
      errorCode: data.error_code,
    },
    terminal: true,
  };
}

/**
 * payment.expired
 * Payment link expired before completion
 * Terminal state - no further events
 * Only valid if payment not confirmed yet
 */
export function handlePaymentExpired(data) {
  return {
    eventType: 'payment.expired',
    action: 'MARK_EXPIRED',
    details: {
      paymentId: data.id,
    },
    terminal: true,
  };
}

/**
 * payment.refunded
 * Payment refunded to customer
 * Terminal state - no further events
 * Only valid after payment confirmed/settled
 */
export function handlePaymentRefunded(data) {
  return {
    eventType: 'payment.refunded',
    action: 'MARK_REFUNDED',
    details: {
      paymentId: data.id,
      refundedAmount: data.refund_amount,
    },
    terminal: true,
  };
}
