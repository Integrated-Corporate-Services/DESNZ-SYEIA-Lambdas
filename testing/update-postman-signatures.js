/**
 * Update Postman Collection with Hardcoded Signatures
 * This script updates the collection JSON with correct signatures and compact payloads
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const WEBHOOK_SECRET = 'test-signing-key-456';
const COLLECTION_FILE = path.join(__dirname, 'webhook-testing-collection.postman.json');

function calculateSignature(payload) {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payloadString, 'utf-8')
    .digest('hex');
}

// Read the collection
console.log('📖 Reading Postman collection...\n');
let collectionContent;
let collection;
try {
  collectionContent = fs.readFileSync(COLLECTION_FILE, 'utf8');
  // Remove BOM if present
  if (collectionContent.charCodeAt(0) === 0xFEFF) {
    collectionContent = collectionContent.slice(1);
  }
  collection = JSON.parse(collectionContent);
} catch (error) {
  console.error('❌ Error reading collection:', error.message);
  process.exit(1);
}

// Define payloads with their correct compact JSON
const testPayloads = {
  "1. Payment Created": {
    webhook_message_id: "evt_created_hp_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_hp_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_hp_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-HP-001",
      description: "Happy path test payment",
      state: { status: "created", finished: false },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "2. Payment Started": {
    webhook_message_id: "evt_started_hp_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:01:00.000Z",
    resource_id: "pay_hp_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_hp_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-HP-001",
      description: "Happy path test payment",
      state: { status: "started", finished: false },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "3. Payment Succeeded": {
    webhook_message_id: "evt_succeeded_hp_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:05:00.000Z",
    resource_id: "pay_hp_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_hp_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-HP-001",
      description: "Happy path test payment",
      state: { status: "success", finished: true },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z",
      card_details: {
        card_brand: "Visa",
        card_type: "debit",
        last_digits_card_number: "4242",
        first_digits_card_number: "424242",
        expiry_date: "12/25",
        cardholder_name: "Test User"
      }
    }
  },
  "4. Payment Captured": {
    webhook_message_id: "evt_captured_hp_001",
    api_version: 1,
    event_type: "card_payment_captured",
    created_date: "2024-01-15T10:10:00.000Z",
    resource_id: "pay_hp_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_hp_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-HP-001",
      description: "Happy path test payment",
      state: { status: "success", finished: true },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z",
      settlement_summary: {
        capture_submit_time: "2024-01-15T10:10:00.000Z",
        captured_date: "2024-01-15"
      }
    }
  },
  "1. Payment Failed - Declined Card": {
    webhook_message_id: "evt_failed_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:05:00.000Z",
    resource_id: "pay_failed_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_failed_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-FAILED-001",
      description: "Failed payment test",
      state: {
        status: "failed",
        finished: true,
        message: "Payment declined by card issuer",
        code: "P0010"
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "2. Payment Failed - Insufficient Funds": {
    webhook_message_id: "evt_failed_002",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:05:00.000Z",
    resource_id: "pay_failed_002",
    resource_type: "payment",
    resource: {
      payment_id: "pay_failed_002",
      payment_provider: "worldpay",
      amount: 50000,
      reference: "REF-FAILED-002",
      description: "Insufficient funds test",
      state: {
        status: "failed",
        finished: true,
        message: "Insufficient funds",
        code: "P0020"
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "3. Payment Cancelled by User": {
    webhook_message_id: "evt_cancelled_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:03:00.000Z",
    resource_id: "pay_cancelled_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_cancelled_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-CANCELLED-001",
      description: "User cancelled payment test",
      state: {
        status: "cancelled",
        finished: true,
        message: "Payment cancelled by user",
        code: "P0030"
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "1. Refund Submitted": {
    webhook_message_id: "evt_refund_submitted_001",
    api_version: 1,
    event_type: "card_payment_refunded",
    created_date: "2024-01-16T14:00:00.000Z",
    resource_id: "refund_001",
    resource_type: "refund",
    resource: {
      refund_id: "refund_001",
      payment_id: "pay_hp_001",
      amount: 10000,
      status: "submitted",
      created_date: "2024-01-16T14:00:00.000Z"
    }
  },
  "2. Refund Succeeded": {
    webhook_message_id: "evt_refund_succeeded_001",
    api_version: 1,
    event_type: "card_payment_refunded",
    created_date: "2024-01-16T14:05:00.000Z",
    resource_id: "refund_001",
    resource_type: "refund",
    resource: {
      refund_id: "refund_001",
      payment_id: "pay_hp_001",
      amount: 10000,
      status: "success",
      created_date: "2024-01-16T14:00:00.000Z",
      settled_date: "2024-01-16"
    }
  },
  "1. Missing Required Fields": {
    webhook_message_id: "evt_missing_fields_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    resource_type: "payment",
    resource: {
      payment_id: "pay_missing_001",
      amount: 10000
    }
  },
  "2. Invalid Amount (Negative)": {
    webhook_message_id: "evt_negative_amount_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_negative_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_negative_001",
      payment_provider: "worldpay",
      amount: -10000,
      reference: "REF-NEGATIVE-001",
      description: "Negative amount test",
      state: { status: "created", finished: false },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "1. Send Duplicate Webhook (First Time)": {
    webhook_message_id: "evt_idempotency_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_idempotency_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_idempotency_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-IDEMPOTENCY-001",
      description: "Idempotency test payment",
      state: { status: "success", finished: true },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "2. Send Same Webhook Again (Duplicate)": {
    webhook_message_id: "evt_idempotency_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_idempotency_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_idempotency_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-IDEMPOTENCY-001",
      description: "Idempotency test payment",
      state: { status: "success", finished: true },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "1. Initial Success State": {
    webhook_message_id: "evt_terminal_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_terminal_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_terminal_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-TERMINAL-001",
      description: "Terminal state test",
      state: { status: "success", finished: true },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "2. Try to Update to Failed (Should Reject)": {
    webhook_message_id: "evt_terminal_002",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:05:00.000Z",
    resource_id: "pay_terminal_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_terminal_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-TERMINAL-001",
      description: "Terminal state test",
      state: {
        status: "failed",
        finished: true,
        message: "Payment failed",
        code: "P0010"
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "3. Try to Update to Cancelled (Should Reject)": {
    webhook_message_id: "evt_terminal_003",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:10:00.000Z",
    resource_id: "pay_terminal_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_terminal_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-TERMINAL-001",
      description: "Terminal state test",
      state: {
        status: "cancelled",
        finished: true,
        message: "Payment cancelled",
        code: "P0030"
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  }
};

function findAndUpdateRequest(items, testName, payload, signature) {
  for (let item of items) {
    if (item.name === testName && item.request) {
      // Update body
      if (item.request.body && item.request.body.mode === 'raw') {
        const compactPayload = JSON.stringify(payload);
        item.request.body.raw = compactPayload;
        console.log(`  ✅ Updated body (${compactPayload.length} bytes)`);
      }
      
      // Update Pay-Signature header
      if (item.request.header) {
        const sigHeader = item.request.header.find(h => h.key === 'Pay-Signature');
        if (sigHeader) {
          sigHeader.value = signature;
          console.log(`  ✅ Updated Pay-Signature: ${signature}`);
        }
      }
      return true;
    }
    
    // Recursively search in nested items
    if (item.item && Array.isArray(item.item)) {
      if (findAndUpdateRequest(item.item, testName, payload, signature)) {
        return true;
      }
    }
  }
  return false;
}

console.log('🔄 Updating requests with hardcoded signatures...\n');

let updated = 0;
for (const [testName, payload] of Object.entries(testPayloads)) {
  const signature = calculateSignature(payload);
  console.log(`${testName}:`);
  console.log(`  Signature: ${signature}`);
  
  if (findAndUpdateRequest(collection.item, testName, payload, signature)) {
    updated++;
  } else {
    console.log(`  ⚠️  Request not found in collection`);
  }
  console.log();
}

// Write updated collection
fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2));

console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ Updated ${updated} requests with hardcoded signatures`);
console.log('═══════════════════════════════════════════════════════════');
console.log('\n📝 Collection updated successfully!');
console.log('📁 File:', COLLECTION_FILE);
console.log('\n🚀 You can now run the collection in Postman without');
console.log('   calculating signatures - they are all hardcoded!\n');
