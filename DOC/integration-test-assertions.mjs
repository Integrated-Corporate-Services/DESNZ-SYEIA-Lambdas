/**
 * ===================================================================
 * Integration Test Assertions Module
 * ===================================================================
 * Contains all validation and assertion functions for integration tests
 * Separates verification logic from test execution
 */

import { EXPECTED_PAYMENT_FIELDS, EXPECTED_WEBHOOK_FIELDS, TEST_MESSAGES } from './integration-test-data.mjs';

// ===================================================================
// Database Assertion Functions
// ===================================================================

/**
 * Verify webhook exists in database
 */
export async function assertWebhookExists(dbPool, webhookId) {
  const result = await dbPool.query(
    'SELECT * FROM payment_webhooks WHERE webhook_id = $1',
    [webhookId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(TEST_MESSAGES.error.webhookNotStored);
  }
  
  return result.rows[0];
}

/**
 * Verify payment exists in database
 */
export async function assertPaymentExists(dbPool, paymentId) {
  const result = await dbPool.query(
    'SELECT * FROM payments WHERE govuk_pay_id = $1',
    [paymentId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(TEST_MESSAGES.error.paymentNotFound);
  }
  
  return result.rows[0];
}

/**
 * Verify payment details match expected values
 */
export function assertPaymentDetails(payment, expected) {
  // Amount verification (handle both string and number)
  if (payment.amount != expected.amount) {
    throw new Error(
      TEST_MESSAGES.error.amountMismatch(
        expected.amount,
        payment.amount,
        typeof payment.amount
      )
    );
  }
  
  // Reference verification
  if (expected.reference && payment.reference !== expected.reference) {
    throw new Error(
      TEST_MESSAGES.error.referenceMismatch(expected.reference, payment.reference)
    );
  }
  
  // Status verification
  if (expected.status && payment.status !== expected.status) {
    throw new Error(
      TEST_MESSAGES.error.unexpectedStatus(expected.status, payment.status)
    );
  }
  
  // Description verification
  if (expected.description && payment.description !== expected.description) {
    throw new Error(
      `Expected description ${expected.description}, got ${payment.description}`
    );
  }
  
  return true;
}

/**
 * Verify event is logged in database
 */
export async function assertEventLogged(dbPool, paymentId, eventType) {
  const result = await dbPool.query(
    'SELECT * FROM payment_events WHERE govuk_pay_id = $1 AND event_type = $2',
    [paymentId, eventType]
  );
  
  if (result.rows.length === 0) {
    throw new Error(TEST_MESSAGES.error.eventNotLogged);
  }
  
  return result.rows;
}

/**
 * Verify payment status is unchanged (idempotency check)
 */
export function assertPaymentStatusUnchanged(initialPayment, finalPayment) {
  if (finalPayment.status !== initialPayment.status) {
    throw new Error(
      TEST_MESSAGES.error.statusChanged(initialPayment.status, finalPayment.status)
    );
  }
  return true;
}

/**
 * Verify event count is unchanged (duplicate detection)
 */
export function assertEventCountUnchanged(initialPayment, finalPayment) {
  if (finalPayment.event_count !== initialPayment.event_count) {
    throw new Error(
      TEST_MESSAGES.error.eventCountChanged(
        initialPayment.event_count,
        finalPayment.event_count
      )
    );
  }
  return true;
}

/**
 * Verify timestamp is set and preserved
 */
export function assertTimestampSet(payment, fieldName = 'confirmed_at') {
  if (!payment[fieldName]) {
    throw new Error(TEST_MESSAGES.error.timestampMissing);
  }
  return true;
}

/**
 * Verify no duplicate payments created
 */
export async function assertNoDuplicatePayment(dbPool, paymentId, expectedCount = 1) {
  const result = await dbPool.query(
    'SELECT COUNT(*) as count FROM payments WHERE govuk_pay_id = $1',
    [paymentId]
  );
  
  const actualCount = parseInt(result.rows[0].count);
  if (actualCount !== expectedCount) {
    throw new Error(TEST_MESSAGES.error.duplicateCreated(actualCount));
  }
  
  return true;
}

/**
 * Verify webhook count for audit trail
 */
export async function assertWebhookCount(dbPool, paymentId, minCount) {
  const result = await dbPool.query(
    'SELECT COUNT(*) as count FROM payment_webhooks WHERE govuk_pay_id = $1',
    [paymentId]
  );
  
  const actualCount = parseInt(result.rows[0].count);
  if (actualCount < minCount) {
    throw new Error(
      `Expected at least ${minCount} webhooks stored, found ${actualCount}`
    );
  }
  
  return actualCount;
}

// ===================================================================
// HTTP Response Assertions
// ===================================================================

/**
 * Verify HTTP response status code matches expected
 */
export function assertResponseStatus(response, expectedStatus) {
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  
  if (!expected.includes(response.statusCode)) {
    throw new Error(
      TEST_MESSAGES.error.unexpectedStatus(
        expected.join(' or '),
        response.statusCode
      )
    );
  }
  
  return true;
}

/**
 * Verify webhook was accepted (200 or 202)
 */
export function assertWebhookAccepted(response) {
  if (response.statusCode !== 200 && response.statusCode !== 202) {
    throw new Error(
      TEST_MESSAGES.error.webhookRejected(response.statusCode, response.body)
    );
  }
  return true;
}

/**
 * Verify webhook was rejected (401, 403, 400)
 */
export function assertWebhookRejected(response, expectedCodes = [401, 403, 400]) {
  if (!expectedCodes.includes(response.statusCode)) {
    throw new Error(
      `Expected rejection with ${expectedCodes.join(' or ')}, got ${response.statusCode}`
    );
  }
  return true;
}

// ===================================================================
// Idempotency Assertions
// ===================================================================

/**
 * Comprehensive idempotency verification
 */
export function assertIdempotentBehavior(initialPayment, finalPayment) {
  const checks = {
    statusUnchanged: false,
    eventCountUnchanged: false,
    timestampPreserved: false,
  };
  
  try {
    assertPaymentStatusUnchanged(initialPayment, finalPayment);
    checks.statusUnchanged = true;
  } catch (error) {
    throw new Error(`Idempotency check failed: ${error.message}`);
  }
  
  try {
    assertEventCountUnchanged(initialPayment, finalPayment);
    checks.eventCountUnchanged = true;
  } catch (error) {
    throw new Error(`Idempotency check failed: ${error.message}`);
  }
  
  try {
    assertTimestampSet(finalPayment, 'confirmed_at');
    checks.timestampPreserved = true;
  } catch (error) {
    throw new Error(`Idempotency check failed: ${error.message}`);
  }
  
  return checks;
}

// ===================================================================
// Complex Assertions (Multiple Validations)
// ===================================================================

/**
 * Verify complete payment creation flow
 */
export async function assertPaymentCreationFlow(dbPool, paymentId, expectedData) {
  // Verify payment exists
  const payment = await assertPaymentExists(dbPool, paymentId);
  
  // Verify payment details
  assertPaymentDetails(payment, expectedData);
  
  // Verify event logged
  await assertEventLogged(dbPool, paymentId, expectedData.eventType);
  
  return payment;
}

/**
 * Verify duplicate webhook handling
 */
export async function assertDuplicateHandling(
  dbPool,
  paymentId,
  initialPayment,
  minWebhookCount
) {
  // Get final payment state
  const finalPayment = await assertPaymentExists(dbPool, paymentId);
  
  // Verify idempotent behavior
  assertIdempotentBehavior(initialPayment, finalPayment);
  
  // Verify webhook audit trail
  const webhookCount = await assertWebhookCount(dbPool, paymentId, minWebhookCount);
  
  return {
    finalPayment,
    webhookCount,
  };
}

// ===================================================================
// Data Integrity Assertions
// ===================================================================

/**
 * Verify payment record has all required fields
 */
export function assertPaymentHasRequiredFields(payment) {
  const missingFields = EXPECTED_PAYMENT_FIELDS.filter(
    (field) => !(field in payment)
  );
  
  if (missingFields.length > 0) {
    throw new Error(`Payment missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

/**
 * Verify webhook record has all required fields
 */
export function assertWebhookHasRequiredFields(webhook) {
  const missingFields = EXPECTED_WEBHOOK_FIELDS.filter(
    (field) => !(field in webhook)
  );
  
  if (missingFields.length > 0) {
    throw new Error(`Webhook missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

// ===================================================================
// Polling Assertions (Wait for Conditions)
// ===================================================================

/**
 * Wait for a condition to be true with polling
 */
export async function waitForCondition(
  conditionFn,
  description,
  maxAttempts = 30,
  pollIntervalMs = 1000
) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await conditionFn();
    if (result) {
      return result;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Timeout waiting for: ${description}`);
}

/**
 * Wait for webhook to be stored in database
 */
export async function waitForWebhookStorage(dbPool, webhookId, maxAttempts = 30) {
  return waitForCondition(
    async () => {
      const result = await dbPool.query(
        'SELECT * FROM payment_webhooks WHERE webhook_id = $1',
        [webhookId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    'Webhook stored in database',
    maxAttempts
  );
}

/**
 * Wait for payment to be created in database
 */
export async function waitForPaymentCreation(dbPool, paymentId, maxAttempts = 30) {
  return waitForCondition(
    async () => {
      const result = await dbPool.query(
        'SELECT * FROM payments WHERE govuk_pay_id = $1',
        [paymentId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    },
    'Payment created in database',
    maxAttempts
  );
}

// ===================================================================
// Utility Functions
// ===================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format assertion error for logging
 */
export function formatAssertionError(error, context = {}) {
  return {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log assertion result
 */
export function logAssertionResult(assertion, passed, details = {}) {
  return {
    assertion,
    passed,
    details,
    timestamp: new Date().toISOString(),
  };
}
