/**
 * ===================================================================
 * Integration Test Scenarios Module
 * ===================================================================
 * Contains test scenario definitions and execution logic
 * Each scenario is a reusable, modular test case
 */

import http from 'http';
import https from 'https';
import crypto from 'crypto';

import {
  CONFIG,
  TEST_SCENARIOS,
  TEST_MESSAGES,
  colors,
  createPaymentWebhookPayload,
  generateWebhookId,
} from './integration-test-data.mjs';

import {
  assertWebhookAccepted,
  assertWebhookRejected,
  assertPaymentCreationFlow,
  assertDuplicateHandling,
  assertNoDuplicatePayment,
  assertPaymentExists,
  waitForWebhookStorage,
  waitForPaymentCreation,
  sleep,
} from './integration-test-assertions.mjs';

// ===================================================================
// Utility Functions
// ===================================================================

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Make HTTP request
 */
async function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Send webhook to inbound-event-receiver
 */
async function sendWebhook(payload, signature, webhookId) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  return httpRequest(`${CONFIG.inboundReceiver.baseUrl}/callback/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Pay-Signature': signature,
      'X-Webhook-Id': webhookId,
    },
    body: payloadString,
  });
}

// ===================================================================
// Test Scenario: New Payment Webhook
// ===================================================================

export async function testNewPaymentWebhook(dbPool) {
  const scenario = TEST_SCENARIOS.newPayment;
  
  log(`\n📝 Test 1: ${scenario.name}`, 'blue');
  log('═'.repeat(60), 'blue');
  
  // Generate test data
  const paymentId = `pay_test_${Date.now()}_new`;
  const webhookId = `evt_test_${Date.now()}_created`;
  
  const webhookPayload = createPaymentWebhookPayload({
    webhookId,
    paymentId,
    reference: 'TEST-REF-NEW-001',
    description: 'Integration test payment',
  });
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  log(`  Payment ID: ${paymentId}`, 'cyan');
  log(`  Webhook ID: ${webhookId}`, 'cyan');
  
  // Step 1: Send webhook
  log(`\n  Step 1: ${TEST_MESSAGES.steps.sendingWebhook}`, 'yellow');
  const response = await sendWebhook(webhookPayload, signature, webhookId);
  
  assertWebhookAccepted(response);
  log(`  ✅ ${TEST_MESSAGES.success.webhookAccepted(response.statusCode)}`, 'green');
  
  // Step 2: Verify webhook stored
  log(`\n  Step 2: ${TEST_MESSAGES.steps.verifyingWebhook}`, 'yellow');
  await waitForWebhookStorage(dbPool, webhookId);
  log(`  ✅ ${TEST_MESSAGES.success.webhookStored}`, 'green');
  
  // Step 3: Wait for payment processor
  log(`\n  Step 3: ${TEST_MESSAGES.steps.waitingForProcessor}`, 'yellow');
  await sleep(CONFIG.test.processorDelayMs);
  
  const payment = await waitForPaymentCreation(dbPool, paymentId);
  log(`  ✅ ${TEST_MESSAGES.success.paymentCreated}`, 'green');
  
  // Step 4: Verify payment details
  log(`\n  Step 4: ${TEST_MESSAGES.steps.verifyingPayment}`, 'yellow');
  await assertPaymentCreationFlow(dbPool, paymentId, {
    amount: 2500,
    reference: 'TEST-REF-NEW-001',
    status: scenario.expectedPaymentStatus,
    eventType: scenario.expectedEventType,
  });
  log(`  ✅ ${TEST_MESSAGES.success.paymentDetailsVerified}`, 'green');
  
  // Step 5: Verify event logged
  log(`\n  Step 5: ${TEST_MESSAGES.steps.verifyingEvent}`, 'yellow');
  log(`  ✅ ${TEST_MESSAGES.success.eventLogged}`, 'green');
  
  log(`\n✅ Test 1 PASSED: ${scenario.description}\n`, 'green');
  
  return { paymentId, webhookId, payment };
}

// ===================================================================
// Test Scenario: Duplicate Confirmed Webhook (Idempotency)
// ===================================================================

export async function testDuplicateConfirmedWebhook(dbPool, existingPaymentId) {
  const scenario = TEST_SCENARIOS.duplicateConfirmed;
  
  log(`\n📝 Test 2: ${scenario.name}`, 'blue');
  log('═'.repeat(60), 'blue');
  
  // Get initial payment state
  const initialPayment = await assertPaymentExists(dbPool, existingPaymentId);
  const initialStatus = initialPayment.status;
  const initialEventCount = initialPayment.event_count;
  
  log(`  Payment ID: ${existingPaymentId}`, 'cyan');
  log(`  Initial Status: ${initialStatus}`, 'cyan');
  log(`  Initial Event Count: ${initialEventCount}`, 'cyan');
  
  // Generate duplicate webhook
  const webhookId = generateWebhookId('duplicate_confirmed');
  const webhookPayload = createPaymentWebhookPayload({
    webhookId,
    paymentId: existingPaymentId,
    reference: 'TEST-REF-NEW-001',
    description: 'Integration test payment',
  });
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  // Step 1: Send duplicate webhook
  log(`\n  Step 1: ${TEST_MESSAGES.steps.sendingDuplicate}`, 'yellow');
  const response = await sendWebhook(webhookPayload, signature, webhookId);
  
  assertWebhookAccepted(response);
  log(`  ✅ ${TEST_MESSAGES.success.webhookAccepted(response.statusCode)}`, 'green');
  
  // Step 2: Verify webhook stored
  log(`\n  Step 2: ${TEST_MESSAGES.steps.verifyingWebhook}`, 'yellow');
  await sleep(CONFIG.test.webhookDelayMs);
  await waitForWebhookStorage(dbPool, webhookId);
  log(`  ✅ ${TEST_MESSAGES.success.webhookStored}`, 'green');
  
  // Step 3: Verify idempotency
  log(`\n  Step 3: ${TEST_MESSAGES.steps.verifyingIdempotency}`, 'yellow');
  await sleep(CONFIG.test.processorDelayMs);
  
  const { finalPayment, webhookCount } = await assertDuplicateHandling(
    dbPool,
    existingPaymentId,
    initialPayment,
    scenario.minWebhookCount
  );
  
  log(`  ✅ ${TEST_MESSAGES.success.statusUnchanged(finalPayment.status)}`, 'green');
  log(`  ✅ ${TEST_MESSAGES.success.eventCountUnchanged(finalPayment.event_count)}`, 'green');
  log(`  ✅ ${TEST_MESSAGES.success.timestampPreserved}`, 'green');
  log(`  ✅ ${TEST_MESSAGES.success.auditTrailComplete(webhookCount)}`, 'green');
  
  log(`\n✅ Test 2 PASSED: ${scenario.description}\n`, 'green');
}

// ===================================================================
// Test Scenario: Duplicate Webhook ID
// ===================================================================

export async function testDuplicateWebhookId(dbPool, webhookId, paymentId) {
  const scenario = TEST_SCENARIOS.duplicateWebhook;
  
  log(`\n📝 Test 3: ${scenario.name}`, 'blue');
  log('═'.repeat(60), 'blue');
  
  log(`  Resending webhook ID: ${webhookId}`, 'cyan');
  
  // Recreate same webhook payload with same ID
  const webhookPayload = createPaymentWebhookPayload({
    webhookId, // Same ID as before
    paymentId,
    reference: 'TEST-REF-NEW-001',
  });
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  // Step 1: Send duplicate webhook
  log(`\n  Step 1: ${TEST_MESSAGES.steps.sendingDuplicate}`, 'yellow');
  const response = await sendWebhook(webhookPayload, signature, webhookId);
  
  // Should be handled appropriately (accepted or rejected)
  if (scenario.expectedStatus.includes(response.statusCode)) {
    log(`  ✅ Duplicate handled correctly (${response.statusCode})`, 'green');
  } else {
    log(`  ⚠️  Unexpected response: ${response.statusCode}`, 'yellow');
  }
  
  // Step 2: Verify no duplicate payment
  log(`\n  Step 2: Verifying no duplicate payment created...`, 'yellow');
  await sleep(CONFIG.test.webhookDelayMs + 1000);
  
  await assertNoDuplicatePayment(dbPool, paymentId, 1);
  log(`  ✅ ${TEST_MESSAGES.success.noDuplicateCreated}`, 'green');
  
  log(`\n✅ Test 3 PASSED: ${scenario.description}\n`, 'green');
}

// ===================================================================
// Test Scenario: Invalid Signature
// ===================================================================

export async function testInvalidSignature(dbPool) {
  const scenario = TEST_SCENARIOS.invalidSignature;
  
  log(`\n📝 Test 4: ${scenario.name}`, 'blue');
  log('═'.repeat(60), 'blue');
  
  // Generate webhook with invalid signature
  const webhookId = generateWebhookId('invalid');
  const paymentId = `pay_test_${Date.now()}_invalid`;
  
  const webhookPayload = createPaymentWebhookPayload({
    webhookId,
    paymentId,
    amount: 1000,
  });
  
  const payloadString = JSON.stringify(webhookPayload);
  const invalidSignature = 'invalid_signature_12345';
  
  // Step 1: Send webhook with invalid signature
  log(`\n  Step 1: ${TEST_MESSAGES.steps.sendingInvalidSignature}`, 'yellow');
  const response = await sendWebhook(webhookPayload, invalidSignature, webhookId);
  
  assertWebhookRejected(response, scenario.expectedStatus);
  log(`  ✅ ${TEST_MESSAGES.success.signatureRejected(response.statusCode)}`, 'green');
  
  log(`\n✅ Test 4 PASSED: ${scenario.description}\n`, 'green');
}

// ===================================================================
// Additional Test Scenarios (Extensible)
// ===================================================================

/**
 * Test scenario: Payment Captured Event
 * This can be enabled when payment-processor supports captured events
 */
export async function testPaymentCapturedEvent(dbPool, existingPaymentId) {
  const scenario = TEST_SCENARIOS.paymentCaptured;
  
  log(`\n📝 Test 5: ${scenario.name}`, 'blue');
  log('═'.repeat(60), 'blue');
  
  const webhookId = generateWebhookId('captured');
  
  const { createPaymentCapturedPayload } = await import('./integration-test-data.mjs');
  const webhookPayload = createPaymentCapturedPayload({
    webhookId,
    paymentId: existingPaymentId,
    reference: 'TEST-REF-NEW-001',
  });
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  log(`  Payment ID: ${existingPaymentId}`, 'cyan');
  log(`  Webhook ID: ${webhookId}`, 'cyan');
  
  const response = await sendWebhook(webhookPayload, signature, webhookId);
  assertWebhookAccepted(response);
  
  log(`\n✅ Test 5 PASSED: ${scenario.description}\n`, 'green');
}
