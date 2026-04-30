# 🔐 Webhook Signature Error - Troubleshooting Guide

## ✅ Good News: Your Webhook IS Working!

I just tested it and got **202 Accepted** - the signature validation is working correctly.

## ❌ Why You're Getting "Invalid webhook signature"

The signature error occurs when the signature doesn't match the payload. Here are the **most common causes**:

### 1. **Payload Formatting (Most Common Issue)**

The signature MUST be calculated on the EXACT JSON string sent in the request body.

#### ❌ WRONG - Formatted JSON with spaces/newlines:
```json
{
  "webhook_message_id": "evt_test_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded"
}
```

#### ✅ CORRECT - Compact JSON (no extra spaces):
```json
{"webhook_message_id":"evt_test_001","api_version":1,"event_type":"card_payment_succeeded"}
```

**Why it matters**: Even ONE extra space or newline changes the signature completely!

### 2. **Wrong Event Type**

Your server only accepts these event types:
- ✅ `card_payment_succeeded`
- ✅ `card_payment_captured`
- ✅ `card_payment_refunded`
- ✅ `PAYMENT_COMPLETED`, `PAYMENT_FAILED`, `PAYMENT_CANCELLED`, `PAYMENT_EXPIRED`
- ✅ `REFUND_SUCCEEDED`, `REFUND_FAILED`

❌ **NOT SUPPORTED**: `card_payment_created`, `card_payment_started`, etc.

### 3. **Signature Calculation Steps**

The signature must be calculated this way:

```javascript
const crypto = require('crypto');
const secret = 'test-signing-key-456';

// Step 1: Create exact JSON string (no formatting!)
const payload = JSON.stringify({
  webhook_message_id: 'evt_test_001',
  // ... rest of payload
});

// Step 2: Calculate HMAC-SHA256
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload, 'utf-8')
  .digest('hex');

// Step 3: Send in Pay-Signature header
// Pay-Signature: <calculated_signature>
```

## ✅ Working Example (Tested)

### Payload (EXACT string):
```json
{"webhook_message_id":"evt_test_001","api_version":1,"event_type":"card_payment_succeeded","created_date":"2024-01-15T10:00:00.000Z","resource_id":"pay_test_001","resource_type":"payment","resource":{"payment_id":"pay_test_001","payment_provider":"worldpay","amount":10000,"reference":"REF-TEST-001","description":"Test payment","state":{"status":"success","finished":true},"return_url":"https://example.com/return","created_date":"2024-01-15T10:00:00.000Z"}}
```

### Signature:
```
0f505d6dc0cb7e4fdcb4e4186957a2c2513216aa76c1177cbf236b2f524911a9
```

### cURL Command (WORKING):
```bash
curl -X POST http://localhost:3000/callback/payment \
  -H "Content-Type: application/json" \
  -H "Pay-Signature: 0f505d6dc0cb7e4fdcb4e4186957a2c2513216aa76c1177cbf236b2f524911a9" \
  -d '{"webhook_message_id":"evt_test_001","api_version":1,"event_type":"card_payment_succeeded","created_date":"2024-01-15T10:00:00.000Z","resource_id":"pay_test_001","resource_type":"payment","resource":{"payment_id":"pay_test_001","payment_provider":"worldpay","amount":10000,"reference":"REF-TEST-001","description":"Test payment","state":{"status":"success","finished":true},"return_url":"https://example.com/return","created_date":"2024-01-15T10:00:00.000Z"}}'
```

### Expected Response (202 Accepted):
```json
{
  "status": "success",
  "webhookId": "evt_test_001",
  "paymentId": "pay_test_001",
  "event_type": "card_payment_succeeded",
  "receivedAt": "2026-04-26T16:04:23.915Z"
}
```

## 🛠️ How to Fix

### Option 1: Use the Test Script

```bash
cd testing
node test-webhook.js
```

This will:
- Calculate the correct signature
- Send the request
- Show you exactly what's happening

### Option 2: Fix Your Postman Request

In Postman:

1. **Body Tab**: Select "raw" and "JSON"

2. **Disable "Pretty" mode** - This is critical!
   - Click the "..." menu in the body editor
   - Uncheck "Beautify/Pretty Print"
   - Make sure JSON is compact (no extra spaces)

3. **Pre-request Script** - Add this to auto-calculate signature:

```javascript
const crypto = require('crypto-js');
const secret = 'test-signing-key-456';

// Get the request body as string
const body = pm.request.body.raw;

// Calculate signature
const signature = crypto.HmacSHA256(body, secret).toString();

// Set header
pm.request.headers.add({
    key: 'Pay-Signature',
    value: signature
});

console.log('Calculated signature:', signature);
```

4. **Make sure your payload uses valid event type**: `card_payment_succeeded`

### Option 3: PowerShell Test

```powershell
$body = '{"webhook_message_id":"evt_test_001","api_version":1,"event_type":"card_payment_succeeded","created_date":"2024-01-15T10:00:00.000Z","resource_id":"pay_test_001","resource_type":"payment","resource":{"payment_id":"pay_test_001","payment_provider":"worldpay","amount":10000,"reference":"REF-TEST-001","description":"Test payment","state":{"status":"success","finished":true},"return_url":"https://example.com/return","created_date":"2024-01-15T10:00:00.000Z"}}'

# Calculate signature
$secret = 'test-signing-key-456'
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$signature = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))).Replace('-','').ToLower()

# Send request
$headers = @{
    'Content-Type' = 'application/json'
    'Pay-Signature' = $signature
}

Invoke-WebRequest -Uri "http://localhost:3000/callback/payment" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -UseBasicParsing
```

## 🔍 Debugging Checklist

When you get "Invalid webhook signature":

- [ ] Is the webhook secret correct? (`test-signing-key-456`)
- [ ] Is the JSON compact (no extra spaces/newlines)?
- [ ] Is the event_type valid? (use `card_payment_succeeded`)
- [ ] Are you using the correct endpoint? (`/callback/payment`)
- [ ] Is the Pay-Signature header being sent?
- [ ] Did you calculate the signature BEFORE sending (not after)?
- [ ] Is Content-Type set to `application/json`?

## 📝 Common Mistakes

### Mistake 1: Using Pretty-Printed JSON
```json
{
  "webhook_message_id": "evt_001",  ← Extra spaces!
  "api_version": 1                  ← Signature won't match
}
```

### Mistake 2: Hardcoding Old Signature
```javascript
// ❌ WRONG - Using signature from documentation
Pay-Signature: 8c9a8f7e3b2d1c5a6e4f8a9b7c6d5e4f...

// ✅ CORRECT - Calculate fresh signature for YOUR payload
const signature = crypto.createHmac('sha256', secret)
  .update(yourPayloadString, 'utf-8')
  .digest('hex');
```

### Mistake 3: Wrong Event Type
```json
{
  "event_type": "card_payment_created"  ← NOT SUPPORTED!
}
```

Should be:
```json
{
  "event_type": "card_payment_succeeded"  ← SUPPORTED!
}
```

## 🎯 Quick Test

Run this to test your signature:

```bash
cd testing
node test-webhook.js
```

If you see **202 Accepted**, your signature is correct!

If you see **401 Unauthorized**, check the debugging tips above.

## 🔐 How Signature Validation Works

1. **Client** calculates HMAC-SHA256 of request body
2. **Client** sends signature in `Pay-Signature` header
3. **Server** receives request and captures raw body
4. **Server** calculates HMAC-SHA256 of received body
5. **Server** compares calculated signature with header signature
6. **Match** = ✅ Valid | **No Match** = ❌ Invalid webhook signature

The key is: **The EXACT same bytes must be used for signature calculation on both sides!**

---

**Server is working correctly! ✅**  
**Webhook Secret**: `test-signing-key-456`  
**Endpoint**: `POST http://localhost:3000/callback/payment`  
**Header**: `Pay-Signature: <hmac-sha256-hex>`
