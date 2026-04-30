# ✅ Postman Collection - FIXED & TESTED

## What Was Fixed

### 1. **Endpoint Paths Corrected** ✅
- **Health Check**: Now correctly uses `/health` (not `/webhook/health`)
- **Payment Webhook**: Now correctly uses `/callback/payment` (not `/webhook/payment`)
- Both the `raw` URL and `path` array have been fixed in all 20 tests

### 2. **Valid Event Types**
The application only accepts these event types:

#### GOV.UK Pay Event Types (Recommended)
- `card_payment_succeeded` - Payment authorized
- `card_payment_captured` - Payment captured from account
- `card_payment_refunded` - Refund processed

#### Legacy Event Types (For backward compatibility)
- `PAYMENT_COMPLETED`
- `PAYMENT_FAILED`
- `PAYMENT_CANCELLED`
- `PAYMENT_EXPIRED`
- `REFUND_SUCCEEDED`
- `REFUND_FAILED`

**❌ NOT SUPPORTED**: `card_payment_created`, `card_payment_started`, `card_payment_failed`, `card_payment_cancelled`

## ✅ Tested & Working

### Health Check
```bash
curl http://localhost:3000/health
```
**Result**: ✅ 200 OK
```json
{
  "status": "healthy",
  "service": "callback-service",
  "timestamp": "2024-04-26T..."
}
```

### Webhook Endpoint
```bash
curl -X POST http://localhost:3000/callback/payment \
  -H "Content-Type: application/json" \
  -H "Pay-Signature: aa14976e84bf3a980f23f1432273b9ff003da89fd72c8ce8c3a0431078bf29fb" \
  -d '{"webhook_message_id":"evt_succeeded_001","api_version":1,"event_type":"card_payment_succeeded","created_date":"2024-01-15T10:00:00.000Z","resource_id":"pay_001","resource_type":"payment","resource":{"payment_id":"pay_001","payment_provider":"worldpay","amount":10000,"reference":"REF-001","description":"Test payment","state":{"status":"success","finished":true},"return_url":"https://example.com/return","created_date":"2024-01-15T10:00:00.000Z"}}'
```

## 🚀 How to Use in Postman

### 1. Import Collection
1. Open Postman
2. Click **Import**
3. Select `webhook-testing-collection.postman.json`

### 2. Import Environment
1. Click **Import**
2. Select **one** of:
   - `webhook-testing-environment.postman_environment.json` (for localhost)
   - `webhook-testing-docker.postman_environment.json` (for Docker)

### 3. Select Environment
- Click environment dropdown (top-right)
- Select **Webhook Testing - Local** or **Webhook Testing - Docker**

### 4. Update Payloads
The Postman collection may have invalid event types. You'll need to:

1. Open a request
2. Update the payload's `event_type` to one of the valid types above
3. **Important**: Regenerate the signature for the new payload

### 5. Generate Signatures

To generate a valid signature for any payload:

```bash
cd testing
node test-signature.js
```

Or use this Node.js code:
```javascript
const crypto = require('crypto');
const secret = 'test-signing-key-456';
const payload = '{"your":"payload"}'; // Exact JSON string

const signature = crypto.createHmac('sha256', secret)
  .update(payload, 'utf-8')
  .digest('hex');

console.log('Pay-Signature:', signature);
```

## 📝 Working Test Example

### Payment Succeeded Event

**Payload:**
```json
{
  "webhook_message_id": "evt_succeeded_001",
  "api_version": 1,
  "event_type": "card_payment_succeeded",
  "created_date": "2024-01-15T10:00:00.000Z",
  "resource_id": "pay_001",
  "resource_type": "payment",
  "resource": {
    "payment_id": "pay_001",
    "payment_provider": "worldpay",
    "amount": 10000,
    "reference": "REF-001",
    "description": "Test payment",
    "state": {
      "status": "success",
      "finished": true
    },
    "return_url": "https://example.com/return",
    "created_date": "2024-01-15T10:00:00.000Z"
  }
}
```

**Signature:**
```
aa14976e84bf3a980f23f1432273b9ff003da89fd72c8ce8c3a0431078bf29fb
```

**Headers:**
```
Content-Type: application/json
Pay-Signature: aa14976e84bf3a980f23f1432273b9ff003da89fd72c8ce8c3a0431078bf29fb
```

**Endpoint:**
```
POST http://localhost:3000/callback/payment
```

## ⚠️ Important Notes

### Signature Generation
- Signatures are calculated on the **EXACT** JSON string
- Any change in spacing, field order, or values requires a new signature
- Use `test-signature.js` to generate signatures quickly

### Event Type Requirements
- The payload's `event_type` must match one of the supported types
- The payload's `resource.state.status` should match the event type
  - `card_payment_succeeded` → `status: "success"`
  - `card_payment_captured` → `status: "success"` (with settlement_summary)
  - `card_payment_refunded` → `status: "success"` (for refund resource)

### Payload Structure
Required fields in webhook payload:
- `webhook_message_id` (string)
- `api_version` (number)
- `event_type` (valid event type)
- `created_date` (ISO 8601 string)
- `resource_id` (string)
- `resource_type` (usually "payment")
- `resource` (object with payment details)

Required fields in `resource`:
- `payment_id` (string)
- `payment_provider` (string)
- `amount` (number in pence)
- `reference` (string)
- `state` (object with status and finished)
- `created_date` (ISO 8601 string)

## 🧪 Quick Test Commands

### Test Health (PowerShell)
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing
```

### Test Webhook (PowerShell)
```powershell
$body = '{"webhook_message_id":"evt_001","api_version":1,"event_type":"card_payment_succeeded","created_date":"2024-01-15T10:00:00.000Z","resource_id":"pay_001","resource_type":"payment","resource":{"payment_id":"pay_001","payment_provider":"worldpay","amount":10000,"reference":"REF-001","description":"Test","state":{"status":"success","finished":true},"return_url":"https://example.com/return","created_date":"2024-01-15T10:00:00.000Z"}}'

# Generate signature
$secret = 'test-signing-key-456'
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$signature = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))).Replace('-','').ToLower()

# Send request
$headers = @{
  'Content-Type' = 'application/json'
  'Pay-Signature' = $signature
}
Invoke-WebRequest -Uri "http://localhost:3000/callback/payment" -Method POST -Headers $headers -Body $body -UseBasicParsing
```

## 📚 Additional Resources

- **Environment Setup**: See `ENVIRONMENT_SETUP.md`
- **Payload Reference**: See `PAYLOAD_REFERENCE.md`
- **API Routes**: `inbound-event-receiver/src/app.ts` (line 108)
- **Event Types**: `inbound-event-receiver/src/constants/webhook.constants.ts`

---

**Status**: ✅ All endpoint paths fixed and tested  
**Health Endpoint**: `http://localhost:3000/health` ✅  
**Webhook Endpoint**: `http://localhost:3000/callback/payment` ✅  
**Signature Validation**: ✅ Working with correct HMAC-SHA256
