/**
 * Generate All Webhook Signatures
 * Calculates correct HMAC-SHA256 signatures for all test payloads
 */

const crypto = require('crypto');

const WEBHOOK_SECRET = 'test-signing-key-456';

function calculateSignature(payload) {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payloadString, 'utf-8')
    .digest('hex');
}

// Happy Path Payloads
const payloads = {
  "Payment Created": {
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
      state: {
        status: "created",
        finished: false
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  
  "Payment Started": {
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
      state: {
        status: "started",
        finished: false
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  
  "Payment Succeeded": {
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
      state: {
        status: "success",
        finished: true
      },
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
  
  "Payment Captured": {
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
      state: {
        status: "success",
        finished: true
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z",
      settlement_summary: {
        capture_submit_time: "2024-01-15T10:10:00.000Z",
        captured_date: "2024-01-15"
      }
    }
  },
  
  "Payment Failed - Declined": {
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
  
  "Payment Cancelled": {
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
  
  "Negative Amount": {
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
      state: {
        status: "created",
        finished: false
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  
  "Idempotency Test - Duplicate 1": {
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
      state: {
        status: "success",
        finished: true
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  
  "Terminal State 1 - Initial Success": {
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
      state: {
        status: "success",
        finished: true
      },
      return_url: "https://example.com/return",
      created_date: "2024-01-15T10:00:00.000Z"
    }
  },
  
  "Terminal State 2 - Failed Update": {
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
  
  "Terminal State 3 - Cancelled Update": {
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

console.log('═══════════════════════════════════════════════════════════');
console.log('🔐 Generating Webhook Signatures');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`Secret: ${WEBHOOK_SECRET}\n`);

const results = {};

for (const [name, payload] of Object.entries(payloads)) {
  const signature = calculateSignature(payload);
  const payloadString = JSON.stringify(payload);
  
  results[name] = {
    signature,
    payload: payloadString,
    length: payloadString.length
  };
  
  console.log(`${name}:`);
  console.log(`  Signature: ${signature}`);
  console.log(`  Payload Length: ${payloadString.length} bytes`);
  console.log();
}

console.log('═══════════════════════════════════════════════════════════');
console.log('✅ All Signatures Generated');
console.log('═══════════════════════════════════════════════════════════\n');

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { results, payloads };
}
