#!/usr/bin/env node
/**
 * ===================================================================
 * End-to-End Integration Test Suite (Modular Version)
 * ===================================================================
 * Tests the complete flow:
 * 1. Send webhook to inbound-event-receiver → 
 * 2. Message queued to SQS → 
 * 3. Payment-processor-webhook processes → 
 * 4. Database updated
 * 
 * Modular Structure:
 * - integration-test-data.mjs: Test data, payloads, configurations
 * - integration-test-assertions.mjs: Validation and assertion functions
 * - integration-test-scenarios.mjs: Test scenario definitions
 * - integration-test.mjs: Main test runner (this file)
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
import pg from 'pg';
const { Pool } = pg;

// Import modular components
import { CONFIG, DB_QUERIES, colors } from './integration-test-data.mjs';
import {
  testNewPaymentWebhook,
  testDuplicateConfirmedWebhook,
  testDuplicateWebhookId,
  testInvalidSignature,
} from './integration-test-scenarios.mjs';

// Database connection pool
const dbPool = new Pool(CONFIG.database);

// ===================================================================
// Utilities
// ===================================================================

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
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

// ===================================================================
// Test Setup
// ===================================================================

async function setupDatabase() {
  log('\n🔧 Setting up database...', 'cyan');
  
  // Clean up existing test data using queries from data module
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
// Main Test Runner
// ===================================================================

async function runIntegrationTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     Integration Test Suite - E2E Payment Processing       ║', 'cyan');
  log('║                   (Modular Version)                        ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  let testResults = {
    passed: 0,
    failed: 0,
    total: 4,
    details: [],
  };
  
  try {
    // Setup
    await checkServices();
    await setupDatabase();
    
    // Run modular test scenarios
    log('\n🚀 Running test scenarios from modular test files...', 'cyan');
    
    // Test 1: New Payment Webhook
    const { paymentId, webhookId } = await testNewPaymentWebhook(dbPool);
    testResults.passed++;
    testResults.details.push({ test: 'New Payment Webhook', status: 'PASSED' });
    
    // Test 2: Duplicate Confirmed Webhook (Idempotency)
    await testDuplicateConfirmedWebhook(dbPool, paymentId);
    testResults.passed++;
    testResults.details.push({ test: 'Duplicate Confirmed Webhook', status: 'PASSED' });
    
    // Test 3: Duplicate Webhook ID
    await testDuplicateWebhookId(dbPool, webhookId, paymentId);
    testResults.passed++;
    testResults.details.push({ test: 'Duplicate Webhook ID', status: 'PASSED' });
    
    // Test 4: Invalid Signature
    await testInvalidSignature(dbPool);
    testResults.passed++;
    testResults.details.push({ test: 'Invalid Signature', status: 'PASSED' });
    
    // Summary
    log('\n╔════════════════════════════════════════════════════════════╗', 'green');
    log('║                   ALL TESTS PASSED ✅                      ║', 'green');
    log('╚════════════════════════════════════════════════════════════╝', 'green');
    
    log(`\n✅ ${testResults.passed}/${testResults.total} tests passed`, 'green');
    log('✅ End-to-end flow verified', 'green');
    log('✅ Idempotency working', 'green');
    log('✅ Security validation working', 'green');
    log('\n📁 Test Structure:', 'cyan');
    log('  ├── integration-test-data.mjs (Test data & configurations)', 'cyan');
    log('  ├── integration-test-assertions.mjs (Validation functions)', 'cyan');
    log('  ├── integration-test-scenarios.mjs (Test scenarios)', 'cyan');
    log('  └── integration-test.mjs (Main runner)\n', 'cyan');
    
    process.exit(0);
  } catch (error) {
    testResults.failed++;
    testResults.details.push({ 
      test: 'Current Test', 
      status: 'FAILED', 
      error: error.message 
    });
    
    log('\n╔════════════════════════════════════════════════════════════╗', 'red');
    log('║                   TESTS FAILED ❌                          ║', 'red');
    log('╚════════════════════════════════════════════════════════════╝', 'red');
    log(`\n❌ Error: ${error.message}`, 'red');
    log(`\n${error.stack}\n`, 'red');
    log(`\n📊 Test Results: ${testResults.passed} passed, ${testResults.failed} failed\n`, 'yellow');
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

// Run tests
runIntegrationTests();
