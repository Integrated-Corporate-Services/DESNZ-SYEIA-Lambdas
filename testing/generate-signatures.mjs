/**
 * ===================================================================
 * Webhook Signature Generator
 * ===================================================================
 * Generates HMAC-SHA256 signatures for webhook payloads
 * Use this to generate signatures for new test scenarios
 */

import crypto from 'crypto';

const WEBHOOK_SECRET = 'test-signing-key-456';

/**
 * Generate HMAC-SHA256 signature for a payload
 */
export function generateSignature(payload) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payloadString, 'utf-8')
    .digest('hex');
}

/**
 * Generate signature and print result
 */
function generateAndPrint(payloadName, payload) {
  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString);
  
  console.log('\n' + '='.repeat(70));
  console.log(`Signature for: ${payloadName}`);
  console.log('='.repeat(70));
  console.log('\nPayload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\nSignature (Pay-Signature header):');
  console.log(signature);
  console.log('\nCurl command:');
  console.log(`curl -X POST http://localhost:3000/webhook/payment \\
  -H "Content-Type: application/json" \\
  -H "Pay-Signature: ${signature}" \\
  -d '${payloadString}'`);
  console.log('='.repeat(70));
}

// Test payloads
const testPayloads = {
  'Payment Created': {
    webhook_message_id: 'evt_created_001',
    api_version: 1,
    event_type: 'card_payment_created',
    created_date: '2024-01-15T10:00:00.000Z',
    resource_id: 'pay_001',
    resource_type: 'payment',
    resource: {
      payment_id: 'pay_001',
      payment_provider: 'worldpay',
      amount: 10000,
      reference: 'REF-001',
      description: 'Test payment',
      state: {
        status: 'created',
        finished: false
      },
      return_url: 'https://example.com/return',
      created_date: '2024-01-15T10:00:00.000Z'
    }
  },
  'Payment Succeeded': {
    webhook_message_id: 'evt_succeeded_001',
    api_version: 1,
    event_type: 'card_payment_succeeded',
    created_date: '2024-01-15T10:05:00.000Z',
    resource_id: 'pay_001',
    resource_type: 'payment',
    resource: {
      payment_id: 'pay_001',
      payment_provider: 'worldpay',
      amount: 10000,
      reference: 'REF-001',
      description: 'Test payment',
      state: {
        status: 'success',
        finished: true
      },
      return_url: 'https://example.com/return',
      created_date: '2024-01-15T10:00:00.000Z',
      card_details: {
        card_brand: 'Visa',
        card_type: 'debit',
        last_digits_card_number: '4242',
        first_digits_card_number: '424242',
        expiry_date: '12/25',
        cardholder_name: 'Test User'
      }
    }
  },
  'Payment Failed': {
    webhook_message_id: 'evt_failed_001',
    api_version: 1,
    event_type: 'card_payment_failed',
    created_date: '2024-01-15T10:05:00.000Z',
    resource_id: 'pay_002',
    resource_type: 'payment',
    resource: {
      payment_id: 'pay_002',
      payment_provider: 'worldpay',
      amount: 10000,
      reference: 'REF-002',
      description: 'Test failed payment',
      state: {
        status: 'failed',
        finished: true,
        message: 'Payment declined',
        code: 'P0010'
      },
      return_url: 'https://example.com/return',
      created_date: '2024-01-15T10:00:00.000Z'
    }
  }
};

// Generate signatures if run directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  console.log('\n🔐 Webhook Signature Generator');
  console.log('Secret Key:', WEBHOOK_SECRET);
  
  Object.entries(testPayloads).forEach(([name, payload]) => {
    generateAndPrint(name, payload);
  });
  
  console.log('\n✅ All signatures generated!');
  console.log('\n💡 To generate a custom signature:');
  console.log('   node generate-signatures.mjs');
}
