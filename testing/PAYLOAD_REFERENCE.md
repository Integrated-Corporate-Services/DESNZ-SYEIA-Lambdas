# Webhook Payload Reference

Complete reference of all test payloads with **correct** pre-calculated signatures.

**Webhook Secret**: `test-signing-key-456`  
**Signature Algorithm**: HMAC-SHA256  
**Header Name**: `Pay-Signature`

---

## ⚠️ Important: Valid GOV.UK Pay Webhook Events

GOV.UK Pay **only sends webhooks for milestone events**, not internal state changes.

### ✅ Valid Webhook Event Types

| Event Type | Description | When Fired |
|------------|-------------|------------|
| `card_payment_succeeded` | Payment authorized | When payment is successfully authorized |
| `card_payment_captured` | Payment captured | When funds are captured from authorization |
| `card_payment_settled` | Payment settled | When payment is settled to your account |
| `card_payment_refunded` | Refund processed | When refund is completed |

### ✅ Legacy Event Types (Also Supported)

| Event Type | Description |
|------------|-------------|
| `PAYMENT_COMPLETED` | Payment completed (legacy) |
| `PAYMENT_FAILED` | Payment failed (legacy) |
| `PAYMENT_CANCELLED` | Payment cancelled (legacy) |
| `PAYMENT_EXPIRED` | Payment expired (legacy) |
| `REFUND_SUCCEEDED` | Refund succeeded (legacy) |
| `REFUND_FAILED` | Refund failed (legacy) |

### ❌ NOT Webhook Events (Internal States Only)

These are **internal API states** and do NOT trigger webhooks:
- ❌ `card_payment_created` - Not a webhook event
- ❌ `card_payment_started` - Not a webhook event
- ❌ `card_payment_failed` - Use `card_payment_succeeded` with failed state
- ❌ `card_payment_cancelled` - Use `card_payment_succeeded` with cancelled state
- ❌ `refund_submitted` - Use `card_payment_refunded`

**If you try to send these, you'll get: `400 Bad Request - Invalid event type`**

---

## Table of Contents

1. [Happy Path Payloads](#happy-path-payloads)
2. [Failure Payloads](#failure-payloads)
3. [Refund Payloads](#refund-payloads)
4. [Invalid Payloads](#invalid-payloads)
5. [Signature Calculation](#signature-calculation)

---

## Happy Path Payloads

> ⚠️ **Important**: GOV.UK Pay webhooks only fire for **milestone events**, not internal state changes.
> 
> **Valid webhook events:**
> - ✅ `card_payment_succeeded` (payment authorized)
> - ✅ `card_payment_captured` (payment captured)
> - ✅ `card_payment_settled` (payment settled)
> - ✅ `card_payment_refunded` (refund processed)
> 
> **NOT webhook events** (internal states only):
> - ❌ `card_payment_created` - Internal state, no webhook
> - ❌ `card_payment_started` - Internal state, no webhook

### 1. Payment Succeeded (Authorized)

**Event Type**: `card_payment_succeeded`  
**Signature**: `7e659e931f862a2b1d69c420c6d87c4ae3f370607779ea6efe5cf43d9275d7d7`

**Description**: Payment has been successfully authorized. This is the first webhook event in the payment lifecycle.

```json
{
  "webhook_message_id": "evt_created_hp_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:00:00.000Z",
  "resource_id": "pay_hp_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_hp_001",
    "payment_provider": "worldpay",
    "amount": 10000,
    "reference": "REF-HP-001",
    "description": "Happy path test payment",
    "state": {
      "status": "created",
      "finished": false
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z"
  }
}
```

**cURL Command**:
```bash
curl -X POST http://localhost:3000/callback/payment \
  -H "Content-Type: application/json" \
  -H "Pay-Signature: 7e659e931f862a2b1d69c420c6d87c4ae3f370607779ea6efe5cf43d9275d7d7" \
  -d '{"webhook_message_id":"evt_created_hp_001","api_version":1,"event_type":"card_payment_succeeded","created_date":"2024-01-15T10:00:00.000Z","resource_id":"pay_hp_001","resource_type":"payment","resource":{"payment_id":"pay_hp_001","payment_provider":"worldpay","amount":10000,"reference":"REF-HP-001","description":"Happy path test payment","state":{"status":"created","finished":false},"return_url":"https://example.com/return","created_date":"2024-01-15T10:00:00.000Z"}}'
```

---

### 2. Payment Succeeded (with Card Details)

**Event Type**: `card_payment_succeeded`  
**Signature**: `d280d2cdebd9146b8cb31c22a43ef5a656b90ec259910579ac6c4aafc05d0e7d`

**Description**: Payment authorized with full card details included.

**Description**: Payment authorized with full card details included.

```json
{
  "webhook_message_id": "evt_succeeded_hp_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:05:00.000Z",
  "resource_id": "pay_hp_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_hp_001",
    "payment_provider": "worldpay",
    "amount": 10000,
    "reference": "REF-HP-001",
    "description": "Happy path test payment",
    "state": {
      "status": "success",
      "finished": true
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z",
    "card_details": {
      "card_brand": "Visa",
      "card_type": "debit",
      "last_digits_card_number": "4242",
      "first_digits_card_number": "424242",
      "expiry_date": "12/25",
      "cardholder_name": "Test User"
    }
  }
}
```

---

### 3. Payment Captured

**Event Type**: `card_payment_captured`  
**Signature**: `c5e707a81c88c0a7b475b260dd068153bc23bf6b07924b85ff8df6a752e0c9a7`

**Description**: Payment has been captured (funds will be transferred to your account).

**Event Type**: `card_payment_captured`  
**Signature**: `5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b`

```json
{
  "webhook_message_id": "evt_captured_hp_001",
  "api_version": 1,
  "event_type": "card_payment_captured",
  "created_date": "2024-01-15T10:10:00.000Z",
  "resource_id": "pay_hp_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_hp_001",
    "payment_provider": "worldpay",
    "amount": 10000,
    "reference": "REF-HP-001",
    "description": "Happy path test payment",
    "state": {
      "status": "success",
      "finished": true
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z",
    "settlement_summary": {
      "capture_submit_time": "2024-01-15T10:10:00.000Z",
      "captured_date": "2024-01-15"
    }
  }
}
```

---

## Failure Payloads

> ℹ️ **Note**: GOV.UK Pay doesn't have a separate `card_payment_failed` webhook event type. Instead, failed payments are represented as `card_payment_succeeded` events with a `failed` status in the resource state, OR using legacy event types like `PAYMENT_FAILED`.

### 1. Payment Failed - Declined Card

**Event Type**: `card_payment_succeeded` (with failed state)  
**Signature**: `894345300d6541e2256c1be1713869dd44d9645a10b88f3bbbd3e1a07f356419`

**Description**: Payment authorization was declined by the card issuer.

```json
{
  "webhook_message_id": "evt_failed_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:05:00.000Z",
  "resource_id": "pay_failed_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_failed_001",
    "payment_provider": "worldpay",
    "amount": 10000,
    "reference": "REF-FAILED-001",
    "description": "Failed payment test",
    "state": {
      "status": "failed",
      "finished": true,
      "message": "Payment declined by card issuer",
      "code": "P0010"
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### 2. Payment Failed - Insufficient Funds

**Event Type**: `card_payment_succeeded` (with failed state)  
**Signature**: `99ab88decaae80bb26cae62061ac819aa61aa650d94bbd5af0e830cd373bad42`

**Description**: Payment failed due to insufficient funds.

```json
{
  "webhook_message_id": "evt_failed_002",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:05:00.000Z",
  "resource_id": "pay_failed_002",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_failed_002",
    "payment_provider": "worldpay",
    "amount": 50000,
    "reference": "REF-FAILED-002",
    "description": "Insufficient funds test",
    "state": {
      "status": "failed",
      "finished": true,
      "message": "Insufficient funds",
      "code": "P0020"
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### 3. Payment Cancelled

**Event Type**: `card_payment_succeeded` (with cancelled state)  
**Signature**: `96f37de93ba1ad2e9691fe34673f53794fb55ae807336ea15c6fb168ee2acb42`

**Description**: Payment was cancelled by the user.

```json
{
  "webhook_message_id": "evt_cancelled_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:03:00.000Z",
  "resource_id": "pay_cancelled_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_cancelled_001",
    "payment_provider": "worldpay",
    "amount": 10000,
    "reference": "REF-CANCELLED-001",
    "description": "User cancelled payment test",
    "state": {
      "status": "cancelled",
      "finished": true,
      "message": "Payment cancelled by user",
      "code": "P0030"
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z"
  }
}
```

---

## Refund Payloads

> ✅ **Valid webhook events for refunds:**
> - `card_payment_refunded` - Refund processed
> - `refund_succeeded` - Legacy event type (also supported)

### 1. Refund Submitted

**Event Type**: `card_payment_refunded`  
**Signature**: `0a53eed728a33024209180c4bbe54971159561a5c3afa2c969cdd92abf9ef00d`

**Description**: Refund has been submitted to the payment provider.

```json
{
  "webhook_message_id": "evt_refund_submitted_001",
  "api_version": 1,
  "event_type": "card_payment_refunded",
  "created_date": "2024-01-16T14:00:00.000Z",
  "resource_id": "refund_001",
  "resource_type": "refund",
  "resource": {
    "refund_id": "refund_001",
    "payment_id": "pay_hp_001",
    "amount": 10000,
    "status": "submitted",
    "created_date": "2024-01-16T14:00:00.000Z"
  }
}
```

---

### 2. Refund Succeeded

**Event Type**: `card_payment_refunded`  
**Signature**: `9957154170b3b9c336094a778b0d37bb6d5f01405ddfc4d2cbed5b0fb68f34e5`

**Description**: Refund has been successfully processed.

```json
{
  "webhook_message_id": "evt_refund_succeeded_001",
  "api_version": 1,
  "event_type": "card_payment_refunded",
  "created_date": "2024-01-16T14:05:00.000Z",
  "resource_id": "refund_001",
  "resource_type": "refund",
  "resource": {
    "refund_id": "refund_001",
    "payment_id": "pay_hp_001",
    "amount": 10000,
    "status": "success",
    "created_date": "2024-01-16T14:00:00.000Z",
    "settled_date": "2024-01-16"
  }
}
```

---

## Invalid Payloads

### 1. Missing Required Fields

**Expected Result**: 400 Bad Request  
**Event Type**: `card_payment_succeeded` (valid type, but missing required fields)  
**Signature**: `d01e5ca2db1ae5a7215b0ba81f014c42e1450b61392873126e83f4b9e4bc1dcc`

```json
{
  "webhook_message_id": "evt_missing_fields_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_missing_001",
    "amount": 10000
  }
}
```

**Missing**: `created_date`, `resource_id`, payment `state`, `reference`

---

### 2. Invalid Amount (Negative)

**Expected Result**: 400 Bad Request  
**Event Type**: `card_payment_succeeded` (valid type, but invalid amount)  
**Signature**: `b556ae52a0187c7c6154724fbad985d60e08a7d88784f752fd71b0e38efa906c`

```json
{
  "webhook_message_id": "evt_negative_amount_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:00:00.000Z",
  "resource_id": "pay_negative_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_negative_001",
    "payment_provider": "worldpay",
    "amount": -10000,
    "reference": "REF-NEGATIVE-001",
    "description": "Negative amount test",
    "state": {
      "status": "created",
      "finished": false
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### 3. Invalid Signature

**Expected Result**: 401 Unauthorized

Use any valid payload with an incorrect signature:
```
Pay-Signature: invalid_signature_12345
```

---

### 4. Missing Signature

**Expected Result**: 401 Unauthorized

Send any valid payload without the `Pay-Signature` header.

---

## Signature Calculation

### Algorithm

1. Convert payload to JSON string (no extra whitespace)
2. Calculate HMAC-SHA256 using webhook secret
3. Convert to hexadecimal string

### Example (Node.js)

```javascript
const crypto = require('crypto');

const webhookSecret = 'test-signing-key-456';
const payload = {
  webhook_message_id: 'evt_test_001',
  api_version: 1,
  event_type: 'card_payment_succeeded',  // ✅ Valid event type
  // ... rest of payload
};

// Convert to JSON string (compact, no whitespace)
const payloadString = JSON.stringify(payload);

// Calculate signature
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payloadString, 'utf-8')
  .digest('hex');

console.log('Signature:', signature);
```

### Example (Python)

```python
import hmac
import hashlib
import json

webhook_secret = 'test-signing-key-456'
payload = {
    'webhook_message_id': 'evt_test_001',
    'api_version': 1,
    'event_type': 'card_payment_succeeded',  # ✅ Valid event type
    # ... rest of payload
}

# Convert to JSON string (compact, no whitespace)
payload_string = json.dumps(payload, separators=(',', ':'))

# Calculate signature
signature = hmac.new(
    webhook_secret.encode('utf-8'),
    payload_string.encode('utf-8'),
    hashlib.sha256
).hexdigest()

print(f'Signature: {signature}')
```

### Example (cURL with Pre-calculated Signature)

```bash
PAYLOAD='{"webhook_message_id":"evt_test_001","api_version":1,"event_type":"card_payment_succeeded"}'
SIGNATURE="calculated_signature_here"

curl -X POST http://localhost:3000/callback/payment \
  -H "Content-Type: application/json" \
  -H "Pay-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

---

## Testing Tips

### 1. Use Valid Event Types Only
⚠️ **Critical**: Only use these event types in your webhooks:
- ✅ `card_payment_succeeded`
- ✅ `card_payment_captured`
- ✅ `card_payment_settled`
- ✅ `card_payment_refunded`
- ✅ Legacy types: `PAYMENT_COMPLETED`, `PAYMENT_FAILED`, etc.

**DO NOT USE:**
- ❌ `card_payment_created` - Will be rejected!
- ❌ `card_payment_started` - Will be rejected!
- ❌ `card_payment_failed` - Will be rejected!

### 2. Exact Payload Match
Signatures are calculated on the exact JSON string. Any difference in whitespace, field order, or encoding will produce a different signature.

### 3. Generate Fresh Signatures
If you modify a payload, you **must** regenerate the signature:
```bash
cd testing
node generate-all-signatures.js
```

### 4. Test Duplicate Handling
Use the same `webhook_message_id` twice to test idempotency:
- First request: Should return 202 Accepted and process normally
- Second request: Should return 202 Accepted but detect duplicate

### 5. Test Terminal State Protection
1. Send payment succeeded event (terminal state)
2. Try to send another update (should be rejected with 409 Conflict)

### 6. Monitor Database
After each test, verify database records:
```sql
SELECT webhook_id, event_type, payment_id, status, created_at 
FROM payment_webhooks 
ORDER BY created_at DESC 
LIMIT 5;
```

---

**Last Updated**: April 2024  
**Webhook Secret**: test-signing-key-456  
**GOV.UK Pay Documentation**: https://docs.payments.service.gov.uk/webhooks/

