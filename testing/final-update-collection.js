/**
 * Final Update - Add Remaining Requests
 * Updates idempotency and terminal state test requests
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const WEBHOOK_SECRET = 'test-signing-key-456';
const COLLECTION_FILE = path.join(__dirname, 'webhook-testing-collection.postman.json');

function calculateSignature(payload) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload), 'utf-8')
    .digest('hex');
}

// Read collection
const collection = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf8'));

// Additional payloads to add
const additionalPayloads = {
  "Duplicate Webhook - First Request": {
    webhook_message_id: "evt_duplicate_test_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_duplicate_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_duplicate_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-DUPLICATE-001",
      description: "Duplicate test payment",
      state: {status: "created", finished: false},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "Duplicate Webhook - Second Request (Idempotent)": {
    webhook_message_id: "evt_duplicate_test_001",
    api_version: 1,
    event_type: "card_payment_succeeded",
    created_date: "2024-01-15T10:00:00.000Z",
    resource_id: "pay_duplicate_001",
    resource_type: "payment",
    resource: {
      payment_id: "pay_duplicate_001",
      payment_provider: "worldpay",
      amount: 10000,
      reference: "REF-DUPLICATE-001",
      description: "Duplicate test payment",
      state: {status: "created", finished: false},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "1. Create Payment for Terminal State Test": {
    webhook_message_id: "evt_terminal_created_001",
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
      description: "Terminal state protection test",
      state: {status: "created", finished: false},
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "2. Payment Failed (Terminal State)": {
    webhook_message_id: "evt_terminal_failed_001",
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
      description: "Terminal state protection test",
      state: {
        status: "failed",
        finished: true,
        message: "Payment declined",
        code: "P0010"
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  "3. Attempt to Update Terminal State (Should Be Rejected)": {
    webhook_message_id: "evt_terminal_update_attempt_001",
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
      description: "Terminal state protection test",
      state: {status: "success", finished: true},
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
    if (item.name && additionalPayloads[item.name]) {
      const payload = additionalPayloads[item.name];
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

console.log('🔄 Updating remaining requests...\n');
const updated = processItems(collection.item);

fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2));

console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ Updated ${updated} additional requests!`);
console.log('═══════════════════════════════════════════════════════════');
console.log('\n📋 All requests now have hardcoded signatures!\n');
