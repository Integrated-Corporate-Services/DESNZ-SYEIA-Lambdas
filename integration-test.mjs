#!/usr/bin/env node
/**
 * ===================================================================
 * End-to-End Integration Test Suite
 * ===================================================================
 * Tests the complete flow:
 * 1. Send webhook to inbound-event-receiver → 
 * 2. Message queued to SQS → 
 * 3. Payment-processor-webhook processes → 
 * 4. Database updated
 * 
 * Prerequisites:
 * - Docker Compose running: docker-compose -f docker-compose.integration.yml up -d
 * - Services healthy and ready
 * 
 * Usage:
 *   node integration-test.mjs
 * ===================================================================
 */

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import pg from 'pg';
const { Pool } = pg;

// ===================================================================
// Configuration
// ===================================================================

const CONFIG = {
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
  },
};

// Database connection pool
const dbPool = new Pool(CONFIG.database);

// ===================================================================
// Utilities
// ===================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(conditionFn, description, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await conditionFn();
    if (result) {
      log(`✅ ${description}`, 'green');
      return result;
    }
    await sleep(CONFIG.test.pollIntervalMs);
  }
  throw new Error(`Timeout waiting for: ${description}`);
}

// ===================================================================
// Test Setup
// ===================================================================

async function setupDatabase() {
  log('\n🔧 Setting up database...', 'cyan');
  
  // Clean up existing test data
  await dbPool.query("DELETE FROM payment_events WHERE govuk_pay_id LIKE 'pay_test_%'");
  await dbPool.query("DELETE FROM payments WHERE govuk_pay_id LIKE 'pay_test_%'");
  await dbPool.query("DELETE FROM payment_webhooks WHERE govuk_pay_id LIKE 'pay_test_%'");
  await dbPool.query("DELETE FROM outbox WHERE aggregate_id LIKE 'pay_test_%'");
  
  log('✅ Database cleaned', 'green');
}

async function checkServices() {
  log('\n🏥 Checking service health...', 'cyan');
  
  try {
    // Check inbound receiver
    const healthResponse = await httpRequest(`${CONFIG.inboundReceiver.baseUrl}/health`);
    if (healthResponse.statusCode === 200) {
      log('✅ Inbound receiver is healthy', 'green');
    } else {
      throw new Error('Inbound receiver not healthy');
    }
    
    // Check database
    const dbResult = await dbPool.query('SELECT 1');
    if (dbResult.rows.length > 0) {
      log('✅ Database is connected', 'green');
    }
    
    // Check LocalStack (SQS)
    const sqsHealthUrl = `${CONFIG.localstack.endpoint}/_localstack/health`;
    const sqsHealth = await httpRequest(sqsHealthUrl);
    if (sqsHealth.statusCode === 200) {
      log('✅ LocalStack is running', 'green');
    }
    
    log('✅ All services are healthy\n', 'green');
  } catch (error) {
    log(`❌ Service health check failed: ${error.message}`, 'red');
    throw error;
  }
}

// ===================================================================
// Test Cases
// ===================================================================

async function testNewPaymentWebhook() {
  log('\n📝 Test 1: New Payment Webhook (payment.created)', 'blue');
  log('═'.repeat(60), 'blue');
  
  const paymentId = `pay_test_${Date.now()}_new`;
  const webhookId = `evt_test_${Date.now()}_created`;
  
  const webhookPayload = {
    webhook_message_id: webhookId,
    api_version: 1,
    event_type: 'card_payment_succeeded',
    created_date: new Date().toISOString(),
    resource_id: paymentId,
    resource_type: 'payment',
    resource: {
      payment_id: paymentId,
      payment_provider: 'worldpay',
      amount: 2500,
      reference: 'TEST-REF-NEW-001',
      description: 'Integration test payment',
      state: {
        status: 'success',
        finished: true,
      },
      return_url: 'https://example.com/return',
      created_date: new Date().toISOString(),
    },
  };
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  log(`  Payment ID: ${paymentId}`, 'cyan');
  log(`  Webhook ID: ${webhookId}`, 'cyan');
  
  // Step 1: Send webhook to inbound-event-receiver
  log('\n  Step 1: Sending webhook to inbound-event-receiver...', 'yellow');
  const response = await httpRequest(`${CONFIG.inboundReceiver.baseUrl}/callback/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Pay-Signature': signature,
      'X-Webhook-Id': webhookId,
    },
    body: payloadString,
  });
  
  if (response.statusCode === 200 || response.statusCode === 202) {
    log(`  ✅ Webhook accepted (${response.statusCode})`, 'green');
  } else {
    throw new Error(`Webhook rejected: ${response.statusCode} - ${response.body}`);
  }
  
  // Step 2: Verify webhook stored in database
  log('\n  Step 2: Verifying webhook stored in database...', 'yellow');
  await waitForCondition(async () => {
    const result = await dbPool.query(
      'SELECT * FROM payment_webhooks WHERE webhook_id = $1',
      [webhookId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }, 'Webhook stored in database');
  
  // Step 3: Wait for payment-processor-webhook to process
  log('\n  Step 3: Waiting for payment-processor-webhook to process...', 'yellow');
  await sleep(5000); // Give processor time to poll and process
  
  const payment = await waitForCondition(async () => {
    const result = await dbPool.query(
      'SELECT * FROM payments WHERE govuk_pay_id = $1',
      [paymentId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }, 'Payment created in database');
  
  // Step 4: Verify payment details
  log('\n  Step 4: Verifying payment details...', 'yellow');
  console.log('DEBUG: payment object:', JSON.stringify(payment, null, 2));
  console.log('DEBUG: payment.amount type:', typeof payment.amount, 'value:', payment.amount);
  console.log('DEBUG: comparison:', payment.amount, '!==', 2500, '=', payment.amount !== 2500);
  
  if (payment.amount != 2500) {  // Changed to != for type coercion
    throw new Error(`Expected amount 2500, got ${payment.amount} (type: ${typeof payment.amount})`);
  }
  if (payment.reference !== 'TEST-REF-NEW-001') {
    throw new Error(`Expected reference TEST-REF-NEW-001, got ${payment.reference}`);
  }
  log('  ✅ Payment details verified', 'green');
  
  // Step 5: Verify event logged
  log('\n  Step 5: Verifying event logged...', 'yellow');
  const eventResult = await dbPool.query(
    'SELECT * FROM payment_events WHERE govuk_pay_id = $1 AND event_type = $2',
    [paymentId, 'card_payment_succeeded']
  );
  
  if (eventResult.rows.length === 0) {
    throw new Error('Event not logged in payment_events table');
  }
  log('  ✅ Event logged', 'green');
  
  log('\n✅ Test 1 PASSED: New payment webhook processed successfully\n', 'green');
  return { paymentId, webhookId };
}

async function testPaymentConfirmedWebhook(existingPaymentId) {
  log('\n📝 Test 2: Payment Confirmed Webhook (payment.confirmed)', 'blue');
  log('═'.repeat(60), 'blue');
  
  const webhookId = `evt_test_${Date.now()}_confirmed`;
  
  const webhookPayload = {
    webhook_message_id: webhookId,
    api_version: 1,
    event_type: 'card_payment_succeeded',
    created_date: new Date().toISOString(),
    resource_id: existingPaymentId,
    resource_type: 'payment',
    resource: {
      payment_id: existingPaymentId,
      payment_provider: 'worldpay',
      amount: 2500,
      reference: 'TEST-REF-NEW-001',
      state: {
        status: 'success',
        finished: true,
      },
      created_date: new Date().toISOString(),
    },
  };
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  log(`  Payment ID: ${existingPaymentId}`, 'cyan');
  log(`  Webhook ID: ${webhookId}`, 'cyan');
  
  // Send webhook
  log('\n  Step 1: Sending confirmed webhook...', 'yellow');
  const response = await httpRequest(`${CONFIG.inboundReceiver.baseUrl}/callback/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Pay-Signature': signature,
      'X-Webhook-Id': webhookId,
    },
    body: payloadString,
  });
  
  if (response.statusCode === 200 || response.statusCode === 202) {
    log(`  ✅ Webhook accepted (${response.statusCode})`, 'green');
  } else {
    throw new Error(`Webhook rejected: ${response.statusCode}`);
  }
  
  // Wait for processing
  log('\n  Step 2: Waiting for payment status update...', 'yellow');
  await sleep(5000);
  
  const payment = await waitForCondition(async () => {
    const result = await dbPool.query(
      'SELECT * FROM payments WHERE govuk_pay_id = $1 AND status = $2',
      [existingPaymentId, 'success']
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }, 'Payment status updated to success');
  
  // Verify confirmed_at is set
  if (!payment.confirmed_at) {
    throw new Error('confirmed_at timestamp not set');
  }
  log('  ✅ Payment confirmed timestamp set', 'green');
  
  // Verify event count increased
  if (payment.event_count < 2) {
    throw new Error(`Expected event_count >= 2, got ${payment.event_count}`);
  }
  log(`  ✅ Event count: ${payment.event_count}`, 'green');
  
  log('\n✅ Test 2 PASSED: Payment confirmed webhook processed successfully\n', 'green');
}

async function testDuplicateWebhook(webhookId, paymentId) {
  log('\n📝 Test 3: Duplicate Webhook (Idempotency)', 'blue');
  log('═'.repeat(60), 'blue');
  
  const webhookPayload = {
    webhook_message_id: webhookId,
    api_version: 1,
    event_type: 'card_payment_succeeded',
    created_date: new Date().toISOString(),
    resource_id: paymentId,
    resource_type: 'payment',
    resource: {
      payment_id: paymentId,
      payment_provider: 'worldpay',
      amount: 2500,
      reference: 'TEST-REF-NEW-001',
      state: {
        status: 'success',
        finished: true,
      },
      created_date: new Date().toISOString(),
    },
  };
  
  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, CONFIG.inboundReceiver.webhookSecret);
  
  log(`  Resending webhook ID: ${webhookId}`, 'cyan');
  
  // Send duplicate webhook
  log('\n  Step 1: Sending duplicate webhook...', 'yellow');
  const response = await httpRequest(`${CONFIG.inboundReceiver.baseUrl}/callback/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Pay-Signature': signature,
      'X-Webhook-Id': webhookId, // Same webhook ID
    },
    body: payloadString,
  });
  
  // Should be rejected or marked as duplicate
  if (response.statusCode === 200 || response.statusCode === 409) {
    log(`  ✅ Duplicate handled correctly (${response.statusCode})`, 'green');
  } else {
    log(`  ⚠️  Unexpected response: ${response.statusCode}`, 'yellow');
  }
  
  // Verify no duplicate payment created
  log('\n  Step 2: Verifying no duplicate payment created...', 'yellow');
  await sleep(3000);
  
  const result = await dbPool.query(
    'SELECT COUNT(*) as count FROM payments WHERE govuk_pay_id = $1',
    [paymentId]
  );
  
  if (parseInt(result.rows[0].count) !== 1) {
    throw new Error(`Expected 1 payment record, found ${result.rows[0].count}`);
  }
  log('  ✅ No duplicate payment created', 'green');
  
  log('\n✅ Test 3 PASSED: Idempotency working correctly\n', 'green');
}

async function testInvalidSignature() {
  log('\n📝 Test 4: Invalid Signature Rejection', 'blue');
  log('═'.repeat(60), 'blue');
  
  const webhookPayload = {
    webhook_message_id: `evt_test_${Date.now()}_invalid`,
    api_version: 1,
    event_type: 'card_payment_succeeded',
    created_date: new Date().toISOString(),
    resource_id: `pay_test_${Date.now()}_invalid`,
    resource_type: 'payment',
    resource: {
      payment_id: `pay_test_${Date.now()}_invalid`,
      payment_provider: 'worldpay',
      amount: 1000,
      state: {
        status: 'success',
        finished: true,
      },
      created_date: new Date().toISOString(),
    },
  };
  
  const payloadString = JSON.stringify(webhookPayload);
  const invalidSignature = 'invalid_signature_12345';
  
  log('  Step 1: Sending webhook with invalid signature...', 'yellow');
  const response = await httpRequest(`${CONFIG.inboundReceiver.baseUrl}/callback/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Pay-Signature': invalidSignature,
      'X-Webhook-Id': `evt_test_${Date.now()}_invalid`,
    },
    body: payloadString,
  });
  
  if (response.statusCode === 401 || response.statusCode === 403) {
    log(`  ✅ Invalid signature rejected (${response.statusCode})`, 'green');
  } else {
    throw new Error(`Expected 401/403, got ${response.statusCode}`);
  }
  
  log('\n✅ Test 4 PASSED: Invalid signatures are rejected\n', 'green');
}

// ===================================================================
// Main Test Runner
// ===================================================================

async function runIntegrationTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     Integration Test Suite - E2E Payment Processing       ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  try {
    // Setup
    await checkServices();
    await setupDatabase();
    
    // Run tests
    const { paymentId, webhookId } = await testNewPaymentWebhook();
    await testPaymentConfirmedWebhook(paymentId);
    await testDuplicateWebhook(webhookId, paymentId);
    await testInvalidSignature();
    
    // Summary
    log('\n╔════════════════════════════════════════════════════════════╗', 'green');
    log('║                   ALL TESTS PASSED ✅                      ║', 'green');
    log('╚════════════════════════════════════════════════════════════╝', 'green');
    log('\n✅ 4/4 tests passed', 'green');
    log('✅ End-to-end flow verified', 'green');
    log('✅ Idempotency working', 'green');
    log('✅ Security validation working\n', 'green');
    
    process.exit(0);
  } catch (error) {
    log('\n╔════════════════════════════════════════════════════════════╗', 'red');
    log('║                   TESTS FAILED ❌                          ║', 'red');
    log('╚════════════════════════════════════════════════════════════╝', 'red');
    log(`\n❌ Error: ${error.message}`, 'red');
    log(`\n${error.stack}\n`, 'red');
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

// Run tests
runIntegrationTests();
