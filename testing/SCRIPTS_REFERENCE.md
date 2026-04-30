# 🛠️ Testing Scripts Reference

All scripts for webhook testing and signature generation.

## 📝 Available Scripts

### 1. `test-webhook.js`
**Purpose**: Test webhook endpoint with correct signature

**Usage**:
```bash
node test-webhook.js
```

**What it does**:
- Generates test payload
- Calculates HMAC-SHA256 signature
- Sends POST request to webhook endpoint
- Shows detailed request/response
- Provides equivalent cURL command

**When to use**: Debug signature validation issues

---

### 2. `generate-all-signatures.js`
**Purpose**: Generate signatures for all test payloads

**Usage**:
```bash
node generate-all-signatures.js
```

**What it does**:
- Lists all test scenarios
- Calculates signature for each payload
- Shows payload length
- Outputs to console

**When to use**: Verify signature calculations or regenerate after payload changes

---

### 3. `batch-update-collection.js`
**Purpose**: Update Postman collection with correct signatures and payloads

**Usage**:
```bash
node batch-update-collection.js
```

**What it does**:
- Reads Postman collection JSON
- Updates 11 main test requests
- Replaces signatures with correct HMAC-SHA256
- Converts payloads to compact JSON
- Saves updated collection

**When to use**: Refresh collection after making changes to test payloads

---

### 4. `final-update-collection.js`
**Purpose**: Update idempotency and terminal state tests

**Usage**:
```bash
node final-update-collection.js
```

**What it does**:
- Updates 5 additional test requests
- Adds signatures for duplicate webhook tests
- Adds signatures for terminal state tests
- Saves updated collection

**When to use**: Complete the collection update after main batch

---

### 5. `update-postman-signatures.js`
**Purpose**: Original signature update script (legacy)

**Usage**:
```bash
node update-postman-signatures.js
```

**What it does**:
- Early version of collection updater
- May have incomplete payload mappings
- **Prefer using batch-update-collection.js instead**

**When to use**: Reference only - use batch-update-collection.js

---

## 🔄 Complete Update Workflow

If you need to regenerate everything from scratch:

```bash
# 1. Generate and verify all signatures
node generate-all-signatures.js

# 2. Update main test requests
node batch-update-collection.js

# 3. Update remaining requests
node final-update-collection.js

# 4. Test one request
node test-webhook.js
```

---

## 🔐 Signature Calculation

All scripts use the same signature algorithm:

```javascript
const crypto = require('crypto');
const secret = 'test-signing-key-456';

function calculateSignature(payload) {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString, 'utf-8')
    .digest('hex');
}
```

**Important**: 
- Payload MUST be compact JSON (no extra whitespace)
- Secret is: `test-signing-key-456`
- Algorithm is: HMAC-SHA256
- Output is: 64-character hex string

---

## 📋 Test Payloads

All test payloads use **valid event types**:
- ✅ `card_payment_succeeded`
- ✅ `card_payment_captured`
- ✅ `card_payment_refunded`

**Not supported**:
- ❌ `card_payment_created`
- ❌ `card_payment_started`
- ❌ `card_payment_failed` (use card_payment_succeeded with failed state)

---

## 🐛 Debugging

### Test Signature Calculation:
```bash
node test-webhook.js
```

### Regenerate All Signatures:
```bash
node generate-all-signatures.js
```

### Update Collection:
```bash
node batch-update-collection.js
node final-update-collection.js
```

### Manual Test:
```bash
curl -X POST http://localhost:3000/callback/payment \
  -H "Content-Type: application/json" \
  -H "Pay-Signature: <your-signature>" \
  -d '{"webhook_message_id":"test_001",...}'
```

---

## 📦 Files These Scripts Modify

| Script | Reads | Writes |
|--------|-------|--------|
| `test-webhook.js` | None | None (just tests) |
| `generate-all-signatures.js` | None | Console output |
| `batch-update-collection.js` | `webhook-testing-collection.postman.json` | Same file |
| `final-update-collection.js` | `webhook-testing-collection.postman.json` | Same file |
| `update-postman-signatures.js` | `webhook-testing-collection.postman.json` | Same file |

---

## ✅ Current Status

All scripts have been run and:
- ✅ 16 requests updated with hardcoded signatures
- ✅ All payloads converted to compact JSON
- ✅ All event types changed to valid values
- ✅ All endpoints corrected to `/callback/payment`
- ✅ Tested and verified working (202 Accepted)

**Collection is ready to use in Postman!** 🎉

---

## 🚀 Next Time You Need Signatures

1. **Modify payload** in one of the scripts
2. **Run**:
   ```bash
   node generate-all-signatures.js  # See new signature
   node batch-update-collection.js  # Update collection
   ```
3. **Test**:
   ```bash
   node test-webhook.js  # Verify it works
   ```
4. **Import to Postman** and run!

---

**All scripts tested and working!** ✅
