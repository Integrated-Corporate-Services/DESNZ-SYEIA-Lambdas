# API Testing Guide - Payment Webhook Integration

This guide explains how to test the payment webhook integration using Postman or Hoppscotch.

## 📋 Prerequisites

- Docker services running: `docker-compose -f docker-compose.integration.yml up -d`
- Inbound receiver accessible at: `http://localhost:3000`
- Webhook signing key: `test-signing-key-456`

## 🚀 Quick Start

### Option 1: Postman

1. **Import Collection**
   ```
   File → Import → Select postman-collection.json
   ```

2. **Automatic Signature Generation**
   - Postman collection includes pre-request scripts
   - Signatures are automatically generated using HMAC-SHA256
   - No manual configuration needed!

3. **Send Request**
   - Select any webhook request
   - Click **Send**
   - Check response (should be `202 Accepted`)

### Option 2: Hoppscotch

1. **Import Collection**
   ```
   Collections → Import → Select hoppscotch-collection.json
   ```

2. **Manual Signature Generation**
   
   Hoppscotch doesn't support crypto libraries in scripts, so generate signatures manually:

   **Method A: Use Online Tool**
   - Copy the request body JSON
   - Go to: https://www.devglan.com/online-tools/hmac-sha256-online
   - Key: `test-signing-key-456`
   - Input: Paste request body
   - Click "Generate HMAC" → Copy hex output
   - Replace `{{SIGNATURE}}` in Pay-Signature header

   **Method B: Use Command Line**
   ```powershell
   # PowerShell
   $payload = Get-Content -Raw request-body.json
   $key = [Text.Encoding]::UTF8.GetBytes("test-signing-key-456")
   $hmac = [Security.Cryptography.HMACSHA256]::new($key)
   $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))
   [BitConverter]::ToString($hash).Replace("-", "").ToLower()
   ```

   ```bash
   # Linux/Mac
   echo -n '{"webhook_message_id":"..."}' | openssl dgst -sha256 -hmac "test-signing-key-456"
   ```

3. **Send Request**
   - Update Pay-Signature header with generated signature
   - Click **Send**

## 📝 Available Requests

### 1. New Payment (card_payment_succeeded)
Creates a new payment webhook event. This simulates the first event received when a customer completes a payment.

**Expected Response:** `202 Accepted`

**What Happens:**
1. ✅ Webhook validated and stored in database
2. ✅ Message sent to SQS queue
3. ✅ Payment processor creates new payment record
4. ✅ Payment status updated to CONFIRMED

### 2. Payment Captured
Simulates a payment being captured (funds taken from customer).

**Expected Response:** `202 Accepted`

### 3. Payment Failed
Simulates a failed payment event.

**Expected Response:** `202 Accepted`

### 4. Invalid Signature
Tests signature validation - should be rejected.

**Expected Response:** `401 Unauthorized`

## 🔍 Verify Results

### Check Webhook Storage
```sql
-- Connect to database
docker exec -it integration-postgres psql -U integration_user -d integration_db

-- View webhooks
SELECT webhook_id, govuk_pay_id, event_type, status, received_at 
FROM payment_webhooks 
ORDER BY received_at DESC 
LIMIT 5;
```

### Check Payment Processing
```sql
-- View payments
SELECT id, govuk_pay_id, amount, reference, status, confirmed_at 
FROM payments 
ORDER BY created_at DESC 
LIMIT 5;

-- View payment events
SELECT event_id, govuk_pay_id, event_type, event_timestamp 
FROM payment_events 
ORDER BY received_at DESC 
LIMIT 5;
```

### Check SQS Queue
```bash
# LocalStack SQS
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/payment-webhook-queue \
  --max-number-of-messages 10
```

### Check Container Logs
```powershell
# Inbound receiver logs
docker logs integration-inbound-receiver --tail 50

# Payment processor logs
docker logs integration-payment-processor --tail 50
```

## 🧪 Test Scenarios

### Scenario 1: Complete Payment Flow
1. Send "New Payment" request → Creates payment
2. Send "Payment Captured" with same `payment_id` → Updates payment
3. Check database: `SELECT * FROM payments WHERE govuk_pay_id = 'pay_xxx';`

### Scenario 2: Duplicate Detection
1. Send "New Payment" request
2. Send same request again (same `webhook_message_id`)
3. Second request should be accepted but marked as duplicate
4. Check logs: `docker logs integration-payment-processor --tail 20`

### Scenario 3: Invalid Signature
1. Send "Invalid Signature" request
2. Should return `401 Unauthorized`
3. Check logs for signature validation failure

## 📊 Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 202 | Accepted | Webhook received and queued for processing |
| 400 | Bad Request | Invalid payload format |
| 401 | Unauthorized | Invalid or missing signature |
| 500 | Server Error | Internal processing error |

## 🔐 Signature Generation Details

The webhook signature uses HMAC-SHA256:

```javascript
const crypto = require('crypto');
const signingKey = 'test-signing-key-456';
const payload = JSON.stringify(webhookBody);
const signature = crypto
  .createHmac('sha256', signingKey)
  .update(payload)
  .digest('hex');
```

**Important:** 
- Signature is calculated on the **exact** request body
- No whitespace modifications
- Use hex encoding (lowercase)

## 🛠️ Troubleshooting

### Issue: 401 Unauthorized
**Cause:** Signature mismatch  
**Fix:** Ensure signature is calculated on exact request body, including all whitespace

### Issue: 400 Bad Request
**Cause:** Invalid JSON or missing required fields  
**Fix:** Validate JSON against GOV.UK Pay webhook format

### Issue: Connection Refused
**Cause:** Services not running  
**Fix:** Start services: `docker-compose -f docker-compose.integration.yml up -d`

### Issue: Payment Not Created
**Cause:** Payment processor not processing SQS messages  
**Fix:** 
1. Check processor logs: `docker logs integration-payment-processor`
2. Verify LocalStack queue: `aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/payment-webhook-queue --attribute-names All`

## 🎯 Tips

1. **Use Postman** for automated testing - signatures generated automatically
2. **Use Hoppscotch** for quick manual tests - lightweight and browser-based
3. **Monitor logs** in real-time: `docker-compose -f docker-compose.integration.yml logs -f`
4. **Clean database** between tests: `docker exec integration-postgres psql -U integration_user -d integration_db -c "TRUNCATE payments, payment_webhooks, payment_events, outbox RESTART IDENTITY CASCADE;"`

## 📚 Additional Resources

- [GOV.UK Pay Webhook Documentation](https://docs.payments.service.gov.uk/webhooks/)
- [Integration Test Suite](./integration-test.mjs)
- [Quick Start Guide](./QUICK_START_INTEGRATION_TESTING.md)
