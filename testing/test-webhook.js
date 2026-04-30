/**
 * Test Webhook Signature - Debug Helper
 * This script helps debug webhook signature issues by:
 * 1. Showing exact payload being sent
 * 2. Calculating correct HMAC-SHA256 signature
 * 3. Testing against live server
 */

const crypto = require('crypto');
const http = require('http');

const WEBHOOK_SECRET = 'test-signing-key-456';
const BASE_URL = 'localhost';
const PORT = 3000;

// Test payload - using valid event type
const payload = {
  webhook_message_id: 'evt_test_001',
  api_version: 1,
  event_type: 'card_payment_succeeded',  // Valid event type
  created_date: '2024-01-15T10:00:00.000Z',
  resource_id: 'pay_test_001',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_001',
    payment_provider: 'worldpay',
    amount: 10000,
    reference: 'REF-TEST-001',
    description: 'Test payment',
    state: {
      status: 'success',
      finished: true
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z'
  }
};

// Convert to JSON string (this is what gets sent in the HTTP body)
const payloadString = JSON.stringify(payload);

// Calculate HMAC-SHA256 signature
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payloadString, 'utf-8')
  .digest('hex');

console.log('═══════════════════════════════════════════════════════════');
console.log('🔐 Webhook Signature Test');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📋 Configuration:');
console.log(`   Secret: ${WEBHOOK_SECRET}`);
console.log(`   Endpoint: http://${BASE_URL}:${PORT}/callback/payment\n`);

console.log('📦 Payload (as JSON string):');
console.log(payloadString);
console.log(`\n📏 Payload Length: ${payloadString.length} bytes\n`);

console.log('🔑 Calculated Signature:');
console.log(`   ${signature}\n`);

console.log('📤 Making Request...\n');

// Prepare HTTP request
const options = {
  hostname: BASE_URL,
  port: PORT,
  path: '/callback/payment',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadString),
    'Pay-Signature': signature
  }
};

// Make the request
const req = http.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📨 Server Response');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Status Code: ${res.statusCode}`);
    console.log(`Status Message: ${res.statusMessage}\n`);
    
    console.log('Response Headers:');
    Object.keys(res.headers).forEach(key => {
      console.log(`   ${key}: ${res.headers[key]}`);
    });
    
    console.log('\nResponse Body:');
    try {
      const jsonResponse = JSON.parse(responseData);
      console.log(JSON.stringify(jsonResponse, null, 2));
    } catch (e) {
      console.log(responseData);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    
    if (res.statusCode === 200) {
      console.log('✅ SUCCESS! Webhook accepted by server');
    } else if (res.statusCode === 401) {
      console.log('❌ SIGNATURE ERROR - Signature validation failed');
      console.log('\n🔍 Debugging Tips:');
      console.log('   1. Verify GOVPAY_WEBHOOK_SIGNING_KEY env variable matches:');
      console.log(`      Expected: ${WEBHOOK_SECRET}`);
      console.log('   2. Check that payload JSON is sent exactly as shown above');
      console.log('   3. Verify Content-Type is application/json');
      console.log('   4. Check Pay-Signature header is being sent');
    } else if (res.statusCode === 400) {
      console.log('❌ VALIDATION ERROR - Payload structure invalid');
    } else {
      console.log(`⚠️  Unexpected status code: ${res.statusCode}`);
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
  });
});

req.on('error', (error) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('❌ Request Error');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(error.message);
  console.log('\n🔍 Possible Issues:');
  console.log('   1. Server not running (run: npm start)');
  console.log('   2. Wrong host/port');
  console.log('   3. Network connection issue');
  console.log('\n═══════════════════════════════════════════════════════════\n');
});

// Send the request
req.write(payloadString);
req.end();

// Also print cURL command for manual testing
console.log('💡 Equivalent cURL Command:');
console.log('─'.repeat(63));
console.log(`curl -X POST http://${BASE_URL}:${PORT}/callback/payment \\
  -H "Content-Type: application/json" \\
  -H "Pay-Signature: ${signature}" \\
  -d '${payloadString}'`);
console.log('─'.repeat(63));
console.log();
