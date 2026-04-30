/**
 * Batch Update All Postman Requests
 * Updates all webhook requests with correct signatures and compact payloads
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
let collection;
try {
  const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
  collection = JSON.parse(content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

// Map request names to payloads (using exact names from collection)
const requestPayloads = {
  // Happy Path
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
      state: {status: "created", finished: false},
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
      state: {status: "started", finished: false},
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
      state: {status: "success", finished: true},
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
      state: {status: "success", finished: true},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z",
      settlement_summary: {
        capture_submit_time: "2024-01-15T10:10:00.000Z",
        captured_date: "2024-01-15"
      }
    }
  },
  // Failure Scenarios
  "Payment Failed - Declined Card": {
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
  "Payment Failed - Insufficient Funds": {
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
  "Payment Cancelled by User": {
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
  // Refunds
  "Refund Submitted": {
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
  "Refund Succeeded": {
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
  // Validation Errors
  "Missing Required Fields": {
    webhook_message_id: "evt_missing_fields_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    resource_type: "payment",
    resource: {
      payment_id: "pay_missing_001",
      amount: 10000
    }
  },
  "Invalid Payment Amount (Negative)": {
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
      state: {status: "created", finished: false},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  // Idempotency
  "Send Duplicate Webhook (First Time)": {
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
      state: {status: "success", finished: true},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "Send Same Webhook Again (Duplicate)": {
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
      state: {status: "success", finished: true},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  // Terminal State
  "Initial Success State": {
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
      state: {status: "success", finished: true},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "Try to Update to Failed (Should Reject)": {
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
  "Try to Update to Cancelled (Should Reject)": {
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

function updateRequest(item, requestName, payload, signature) {
  if (!item.request || !item.request.body || item.request.body.mode !== 'raw') {
    return false;
  }
  
  const compactPayload = JSON.stringify(payload);
  item.request.body.raw = compactPayload;
  
  if (item.request.header) {
    const sigHeader = item.request.header.find(h => h.key === 'Pay-Signature');
    if (sigHeader) {
      sigHeader.value = signature;
    } else {
      // Add signature header if missing
      item.request.header.push({
        key: 'Pay-Signature',
        value: signature,
        description: 'HMAC-SHA256 signature'
      });
    }
  }
  
  console.log(`✅ ${requestName}`);
  console.log(`   Signature: ${signature}`);
  console.log(`   Payload: ${compactPayload.length} bytes\n`);
  return true;
}

function processItems(items) {
  let count = 0;
  for (const item of items) {
    if (item.name && requestPayloads[item.name]) {
      const payload = requestPayloads[item.name];
      const signature = calculateSignature(payload);
      if (updateRequest(item, item.name, payload, signature)) {
        count++;
      }
    }
    if (item.item && Array.isArray(item.item)) {
      count += processItems(item.item);
    }
  }
  return count;
}

console.log('🔄 Updating requests...\n');
const updated = processItems(collection.item);

// Write updated collection
fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2));

console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ Updated ${updated} requests with hardcoded signatures!`);
console.log('═══════════════════════════════════════════════════════════\n');
console.log('🚀 Ready to test! All signatures are hardcoded in Postman.\n');
