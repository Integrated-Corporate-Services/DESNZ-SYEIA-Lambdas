/**
 * ===================================================================
 * Integration Test Data Module
 * ===================================================================
 * Contains all test data, payloads, and test configurations
 * Separated for easy maintenance and reusability
 */

// ===================================================================
// Test Configuration
// ===================================================================

export const CONFIG = {
  inboundReceiver: {
    baseUrl: 'http://localhost:3000',
    webhookSecret: 'test-signing-key-456',
  },
  localstack: {
    endpoint: 'http://localhost:4566',
    queueName: 'payment-webhook-queue',
    region: 'eu-west-2',
  },
  database: {
    host: 'localhost',
    port: 5433,
    database: 'integration_db',
    user: 'integration_user',
    password: 'integration_pass',
  },
  test: {
    timeoutMs: 30000,
    pollIntervalMs: 1000,
    maxPolls: 30,
    processorDelayMs: 5000, // Time to wait for payment processor
    webhookDelayMs: 2000,   // Time between webhook operations
  },
};

// ===================================================================
// Test Data Generators
// ===================================================================

/**
 * Generate a unique payment ID for testing
 */
export function generatePaymentId(suffix = 'test') {
  return `pay_test_${Date.now()}_${suffix}`;
}

/**
 * Generate a unique webhook ID for testing
 */
export function generateWebhookId(suffix = 'test') {
  return `evt_test_${Date.now()}_${suffix}`;
}

/**
 * Generate current ISO timestamp
 */
export function getCurrentTimestamp() {
  return new Date().toISOString();
}

// ===================================================================
// Test Payload Templates
// ===================================================================

/**
 * Create a standard payment webhook payload
 */
export function createPaymentWebhookPayload({
  webhookId = generateWebhookId(),
  paymentId = generatePaymentId(),
  eventType = 'card_payment_succeeded',
  amount = 2500,
  reference = 'TEST-REF-001',
  description = 'Integration test payment',
  paymentProvider = 'worldpay',
  status = 'success',
}) {
  return {
    webhook_message_id: webhookId,
    api_version: 1,
    event_type: eventType,
    created_date: getCurrentTimestamp(),
    resource_id: paymentId,
    resource_type: 'payment',
    resource: {
      payment_id: paymentId,
      payment_provider: paymentProvider,
      amount,
      reference,
      description,
      state: {
        status,
        finished: true,
      },
      return_url: 'https://example.com/return',
      created_date: getCurrentTimestamp(),
    },
  };
}

/**
 * Create a payment captured webhook payload
 */
export function createPaymentCapturedPayload({
  webhookId = generateWebhookId('captured'),
  paymentId = generatePaymentId(),
  amount = 2500,
  reference = 'TEST-REF-001',
}) {
  return {
    webhook_message_id: webhookId,
    api_version: 1,
    event_type: 'card_payment_captured',
    created_date: getCurrentTimestamp(),
    resource_id: paymentId,
    resource_type: 'payment',
    resource: {
      payment_id: paymentId,
      payment_provider: 'worldpay',
      amount,
      reference,
      description: 'Integration test payment',
      state: {
        status: 'captured',
        finished: true,
      },
      created_date: getCurrentTimestamp(),
    },
  };
}

/**
 * Create a refund webhook payload
 */
export function createRefundWebhookPayload({
  webhookId = generateWebhookId('refund'),
  paymentId = generatePaymentId(),
  refundId = `refund_test_${Date.now()}`,
  amount = 2500,
  reference = 'TEST-REF-001',
}) {
  return {
    webhook_message_id: webhookId,
    api_version: 1,
    event_type: 'card_payment_refunded',
    created_date: getCurrentTimestamp(),
    resource_id: refundId,
    resource_type: 'refund',
    resource: {
      refund_id: refundId,
      payment_id: paymentId,
      amount,
      status: 'success',
      created_date: getCurrentTimestamp(),
    },
  };
}

/**
 * Create an invalid webhook payload (missing required fields)
 */
export function createInvalidWebhookPayload() {
  return {
    webhook_message_id: generateWebhookId('invalid'),
    api_version: 1,
    event_type: 'card_payment_succeeded',
    created_date: getCurrentTimestamp(),
    resource_id: generatePaymentId('invalid'),
    resource_type: 'payment',
    resource: {
      payment_id: generatePaymentId('invalid'),
      payment_provider: 'worldpay',
      amount: 1000,
      // Missing required 'description' field
      state: {
        status: 'success',
        finished: true,
      },
      created_date: getCurrentTimestamp(),
    },
  };
}

// ===================================================================
// Test Scenarios Data
// ===================================================================

/**
 * Test scenario definitions with expected outcomes
 */
export const TEST_SCENARIOS = {
  newPayment: {
    name: 'New Payment Webhook',
    description: 'Send a new payment webhook and verify it creates a payment record',
    expectedStatus: 202,
    expectedPaymentStatus: 'CONFIRMED',
    expectedEventType: 'card_payment_succeeded',
    minWebhookCount: 1,
  },
  
  duplicateConfirmed: {
    name: 'Duplicate Confirmed Webhook',
    description: 'Send duplicate confirmed webhook to test idempotency',
    expectedStatus: 202,
    shouldChangeStatus: false,
    shouldIncrementEventCount: false,
    minWebhookCount: 2,
  },
  
  duplicateWebhook: {
    name: 'Duplicate Webhook ID',
    description: 'Resend same webhook_message_id to test duplicate detection',
    expectedStatus: [200, 202, 400, 409],
    shouldCreateDuplicate: false,
  },
  
  invalidSignature: {
    name: 'Invalid Signature Rejection',
    description: 'Send webhook with invalid signature',
    expectedStatus: [401, 403],
    shouldReject: true,
  },
  
  paymentCaptured: {
    name: 'Payment Captured Event',
    description: 'Send payment captured webhook for existing payment',
    expectedStatus: 202,
    expectedEventType: 'card_payment_captured',
    shouldUpdatePaymentStatus: true,
  },
};

// ===================================================================
// Expected Database States
// ===================================================================

/**
 * Expected payment record structure
 */
export const EXPECTED_PAYMENT_FIELDS = [
  'id',
  'govuk_pay_id',
  'reference',
  'amount',
  'status',
  'description',
  'event_history',
  'event_count',
  'last_event_type',
  'confirmed_at',
  'created_at',
  'updated_at',
];

/**
 * Expected webhook record structure
 */
export const EXPECTED_WEBHOOK_FIELDS = [
  'id',
  'webhook_id',
  'govuk_pay_id',
  'event_type',
  'status',
  'raw_payload',
  'received_at',
  'processed_at',
];

/**
 * Expected event record structure
 */
export const EXPECTED_EVENT_FIELDS = [
  'id',
  'govuk_pay_id',
  'event_type',
  'event_data',
  'created_at',
];

// ===================================================================
// Database Query Templates
// ===================================================================

export const DB_QUERIES = {
  cleanupTestData: `
    DELETE FROM payment_events WHERE govuk_pay_id LIKE 'pay_test_%';
    DELETE FROM payments WHERE govuk_pay_id LIKE 'pay_test_%';
    DELETE FROM payment_webhooks WHERE govuk_pay_id LIKE 'pay_test_%';
    DELETE FROM outbox WHERE aggregate_id LIKE 'pay_test_%';
  `,
  
  findWebhookById: 'SELECT * FROM payment_webhooks WHERE webhook_id = $1',
  
  findPaymentById: 'SELECT * FROM payments WHERE govuk_pay_id = $1',
  
  countPaymentsByPaymentId: 'SELECT COUNT(*) as count FROM payments WHERE govuk_pay_id = $1',
  
  countWebhooksByPaymentId: 'SELECT COUNT(*) as count FROM payment_webhooks WHERE govuk_pay_id = $1',
  
  findEventsByPaymentId: 'SELECT * FROM payment_events WHERE govuk_pay_id = $1 AND event_type = $2',
  
  getAllEventsByPaymentId: 'SELECT * FROM payment_events WHERE govuk_pay_id = $1 ORDER BY created_at',
};

// ===================================================================
// Test Result Messages
// ===================================================================

export const TEST_MESSAGES = {
  success: {
    webhookAccepted: (code) => `Webhook accepted (${code})`,
    webhookStored: 'Webhook stored in database',
    paymentCreated: 'Payment created in database',
    paymentDetailsVerified: 'Payment details verified',
    eventLogged: 'Event logged',
    statusUnchanged: (status) => `Payment status unchanged (${status}) - idempotent ✓`,
    eventCountUnchanged: (count) => `Event count unchanged (${count}) - duplicate detected ✓`,
    timestampPreserved: 'Payment confirmed timestamp preserved',
    auditTrailComplete: (count) => `Both webhooks stored (${count} total) - audit trail complete`,
    noDuplicateCreated: 'No duplicate payment created',
    signatureRejected: (code) => `Invalid signature rejected (${code})`,
  },
  
  error: {
    webhookRejected: (code, body) => `Webhook rejected: ${code} - ${body}`,
    webhookNotStored: 'Webhook not stored in database',
    paymentNotFound: 'Payment not found in database',
    eventNotLogged: 'Event not logged in payment_events table',
    statusChanged: (initial, final) => `Payment status changed from ${initial} to ${final} - should be idempotent`,
    eventCountChanged: (initial, final) => `Event count changed: ${initial} -> ${final} (should remain unchanged for duplicate event type)`,
    timestampMissing: 'confirmed_at timestamp missing',
    duplicateCreated: (count) => `Expected 1 payment record, found ${count}`,
    unexpectedStatus: (expected, actual) => `Expected ${expected}, got ${actual}`,
    amountMismatch: (expected, actual, type) => `Expected amount ${expected}, got ${actual} (type: ${type})`,
    referenceMismatch: (expected, actual) => `Expected reference ${expected}, got ${actual}`,
  },
  
  steps: {
    sendingWebhook: 'Sending webhook to inbound-event-receiver...',
    verifyingWebhook: 'Verifying webhook stored in database...',
    waitingForProcessor: 'Waiting for payment-processor-webhook to process...',
    verifyingPayment: 'Verifying payment details...',
    verifyingEvent: 'Verifying event logged...',
    sendingDuplicate: 'Sending duplicate webhook...',
    verifyingIdempotency: 'Waiting for processing and verifying idempotency...',
    sendingInvalidSignature: 'Sending webhook with invalid signature...',
  },
};

// ===================================================================
// Utility Data
// ===================================================================

export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};
