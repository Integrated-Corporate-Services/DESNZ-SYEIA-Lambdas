#!/usr/bin/env node
/**
 * Test Webhook Signature Generation
 * This script demonstrates correct signature generation for GOV.UK Pay webhooks
 */

import crypto from 'crypto';
import http from 'http';

const SIGNING_KEY = 'test-signing-key-456';
const ENDPOINT = 'http://localhost:3000/callback/payment';

// CRITICAL: The payload must be sent as a string with NO extra whitespace
// The signature is computed on the EXACT raw body string
const payload = {
  "webhook_message_id": `evt_${Date.now()}_test`,
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": new Date().toISOString(),
  "resource_id": `pay_${Date.now()}_test`,
  "resource_type": "payment",
  "resource": {
    "payment_id": `pay_${Date.now()}_test`,
    "payment_provider": "worldpay",
    "amount": 2500,
    "reference": "TEST-REF-001",
    "description": "JavaScript test payment",
    "state": {
      "status": "success",
      "finished": true
    },
    "return_url": "https://example.com/return",
    "created_date": new Date().toISOString()
  }
};

// Convert to string - this is what will be sent and signed
const payloadString = JSON.stringify(payload);

// Generate HMAC-SHA256 signature
const signature = crypto
  .createHmac('sha256', SIGNING_KEY)
  .update(payloadString)
  .digest('hex');

console.log('='.repeat(70));
console.log('🔐 Webhook Signature Test');
console.log('='.repeat(70));
console.log('\n📝 Payload String:');
console.log(payloadString);
console.log('\n🔑 Generated Signature:');
console.log(signature);
console.log('\n📨 Sending request to:', ENDPOINT);
console.log('='.repeat(70));

// Send the request
const url = new URL(ENDPOINT);
const options = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadString),
    'Pay-Signature': signature,
    'X-Webhook-Id': payload.webhook_message_id
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  console.log('\n✅ Response Status:', res.statusCode);
  console.log('📋 Response Headers:', JSON.stringify(res.headers, null, 2));
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n📦 Response Body:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
    
    if (res.statusCode === 202) {
      console.log('\n🎉 SUCCESS! Webhook accepted.');
    } else {
      console.log('\n❌ FAILED! Status:', res.statusCode);
      console.log('\n💡 Troubleshooting:');
      console.log('1. Check Docker is running: docker ps');
      console.log('2. Verify signing key matches: GOVPAY_WEBHOOK_SIGNING_KEY=test-signing-key-456');
      console.log('3. Ensure endpoint is correct: http://localhost:3000/callback/payment');
    }
    console.log('='.repeat(70));
  });
});

req.on('error', (error) => {
  console.error('\n❌ Error:', error.message);
  console.log('\n💡 Make sure Docker containers are running:');
  console.log('   docker-compose -f docker-compose.integration.yml up -d');
});

// Send the exact payload string
req.write(payloadString);
req.end();
