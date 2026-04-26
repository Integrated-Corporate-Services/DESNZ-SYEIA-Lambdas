# Integration Testing - Final Status Report

## Date: April 25, 2026

## Executive Summary

Successfully resolved **major TypeScript compilation errors** and **database schema misalignments**. The inbound-event-receiver now successfully accepts webhooks, validates signatures, and stores them in the database. However, the SQS integration between services is blocked by AWS SDK v3 compatibility issues with LocalStack 2.3.

---

## ✅ **COMPLETED**

### 1. TypeScript Compilation Fixes
- **Fixed all ES6 module import/export issues** across 7+ files
  - Changed `require()` statements to `import` statements
  - Fixed getLogger imports in multiple files
  - Resolved config.ts export patterns
- **Resolved TypeScript type errors** in callbackController.ts
  - Fixed webhookId type casting (string vs object)
  - Corrected WEBHOOK_STATUS constant usage
  - Fixed WebhookResponse type conversion

### 2. Database Schema Alignment
- **Updated all SQL queries** to match actual database schema:
  - Changed `payment_id` → `govuk_pay_id` throughout codebase
  - Changed `raw_payload` → `webhook_data` where applicable
  - Fixed SQL parameter counts (removed unused parameters)
- **Updated repository interfaces** (WebhookData, paymentWebhookRepository.ts)
- **Fixed webhook ID extraction** to use `webhook_message_id` from payload

### 3. Configuration Fixes
- **Updated docker-compose.integration.yml**:
  - Changed `SQS_QUEUE_URL` → `PAYMENT_WEBHOOK_QUEUE_URL` for inbound-receiver
  - Added missing `CORS_ORIGINS=*` environment variable
  - Fixed `AWS_ENDPOINT` (not AWS_ENDPOINT_URL) for inbound-receiver
- **Fixed environment variable mapping** in config.ts

### 4. Webhook Processing
- **GOV.UK Pay webhook format** correctly implemented:
  - Official webhook structure with `webhook_message_id`, `api_version`, `resource`
  - Proper HMAC-SHA256 signature verification
  - Correct signing key: `test-signing-key-456`
  - Correct webhook endpoint: `/callback/payment`
  - Correct signature header: `Pay-Signature`

### 5. Docker Services
- **PostgreSQL**: ✅ Running healthy (port 5433)
- **LocalStack**: ✅ Running healthy (port 4566)
- **Inbound-receiver**: ✅ Running healthy (port 3000)
- **Payment-processor**: ⚠️  Running but SQS polling fails

### 6. Integration Test Progress
- **Test 1 - Step 1**: ✅ Webhook accepted (202 status)
- **Test 1 - Step 2**: ✅ Webhook stored in database with correct webhook_message_id
- **Test 1 - Step 3**: ❌ Timeout waiting for payment processor

---

## ❌ **BLOCKING ISSUE**

### AWS SDK v3 / LocalStack 2.3 Compatibility

**Problem**: Both inbound-receiver and payment-processor fail to communicate with LocalStack SQS.

**Error Message**:
```
SyntaxError: Unexpected token < in JSON at position 0
Deserialization error: Operation detection failed. Missing Action in request for query-protocol service ServiceModel(sqs).
```

**Root Cause**: LocalStack 2.3 doesn't fully support AWS SDK v3's JSON protocol format. The awslocal CLI works fine, but Node.js applications using @aws-sdk/client-sqs fail.

**Evidence**:
- ✅ Manual SQS queue creation via awslocal CLI succeeds
- ✅ Manual SQS message send via awslocal CLI succeeds  
- ❌ Inbound-receiver SQS send fails with protocol error
- ❌ Payment-processor SQS polling fails with protocol error

---

## 🔧 **POTENTIAL SOLUTIONS**

### Option 1: Upgrade LocalStack (Recommended)
```yaml
localstack:
  image: localstack/localstack:3.0  # or later
```
**Pros**: Should fix AWS SDK v3 compatibility
**Cons**: Might require other config changes

### Option 2: Downgrade AWS SDK
```json
"@aws-sdk/client-sqs": "^3.300.0"  // Try older v3 version
```
**Pros**: Might work with LocalStack 2.3
**Cons**: Technical debt, older SDK

### Option 3: Use aws-sdk v2 (Legacy)
```bash
npm install aws-sdk@2.x
```
**Pros**: Known to work with LocalStack 2.3
**Cons**: Legacy package, AWS deprecated

### Option 4: Disable SQS for Testing
Set `SQS_ENABLED=false` and manually trigger payment processor via direct database polling or HTTP endpoint.

---

## 📊 **DATABASE STATUS**

### Webhook Storage (Working)
```sql
SELECT webhook_id, govuk_pay_id, event_type, status 
FROM payment_webhooks 
ORDER BY created_at DESC LIMIT 5;

           webhook_id           |        govuk_pay_id        |       event_type       |   status   
--------------------------------+----------------------------+------------------------+------------
 evt_test_1777113928626_created | pay_test_1777113928626_new | card_payment_succeeded | failed
```

**Status**: `failed` because SQS send failed, but webhook record is correctly stored.

### Payment Table (Empty)
No payments created yet because payment-processor never receives the webhook from SQS.

---

## 📁 **KEY FILES MODIFIED**

1. `inbound-event-receiver/src/controllers/callbackController.ts` - Fixed TypeScript errors
2. `inbound-event-receiver/src/config/config.ts` - Fixed exports, added PAYMENT_WEBHOOK_QUEUE_URL
3. `inbound-event-receiver/src/constants/sql.constants.ts` - Updated all SQL queries
4. `inbound-event-receiver/src/repositories/paymentWebhookRepository.ts` - Updated schema references
5. `inbound-event-receiver/src/services/paymentWebhookService.ts` - Fixed govuk_pay_id usage
6. `inbound-event-receiver/src/middlewares/validateWebhookSignature.ts` - Fixed webhook_message_id extraction
7. `DESNZ-SYEIA-Lambdas/payment-processor-webhook/Dockerfile.integration` - Added forcePathStyle for SQS
8. `docker-compose.integration.yml` - Fixed environment variable names
9. `integration-test.mjs` - Updated to use correct GOV.UK Pay format

---

## 🚀 **NEXT STEPS**

### Immediate (Critical Path)
1. **Upgrade LocalStack** to version 3.x to fix AWS SDK v3 compatibility
2. **Restart all services** with new LocalStack version
3. **Run integration test** to verify end-to-end flow

### Alternative (Workaround)
1. **Disable SQS**: Set `SQS_ENABLED=false` in both services
2. **Add HTTP endpoint** to payment-processor for manual webhook triggering
3. **Modify integration test** to POST directly to payment-processor

### Validation Steps
1. Clear database: `docker exec integration-postgres psql -U integration_user -d integration_db -c "TRUNCATE payment_webhooks, payments RESTART IDENTITY;"`
2. Restart services: `docker-compose -f docker-compose.integration.yml restart`
3. Run test: `node integration-test.mjs`
4. Verify: Check that payments table has records

---

## 📝 **LOGS & EVIDENCE**

### Successful Webhook Receipt
```json
{"timestamp":"2026-04-25T10:45:28.657Z","level":"info","module":"webhookPayloadValidator.js","message":"[WebhookValidator] Payload validation passed","webhook_message_id":"evt_test_1777113928626_created","event_type":"card_payment_succeeded"}
```

### Successful Database Storage
```json
{"timestamp":"2026-04-25T10:45:28.725Z","level":"info","module":"paymentWebhookRepository.js","message":"[WebhookRepository] Webhook record created","webhookId":"evt_test_1777113928626_created","govukPayId":"pay_test_1777113928626_new"}
```

### SQS Failure
```json
{"timestamp":"2026-04-25T10:45:28.958Z","level":"error","module":"sqsService.js","message":"[SQS] Failed to send message","error":"Unexpected token < in JSON at position 0"}
```

---

## 💡 **RECOMMENDATIONS**

1. **Upgrade LocalStack immediately** - This is the fastest path to success
2. **Add retry mechanism** - Even after fixing SQS, add exponential backoff for resilience  
3. **Add integration test timeout config** - Current 10s timeout might be too short for slow environments
4. **Document LocalStack version requirement** - Add to README that LocalStack 3.x+ is required
5. **Consider adding healthcheck for SQS** - Verify SQS connectivity during service startup

---

## 🎯 **SUCCESS CRITERIA**

- [✅] Webhooks accepted via HTTP endpoint
- [✅] Webhook signatures validated correctly
- [✅] Webhooks stored in database
- [❌] Webhooks sent to SQS successfully  
- [❌] Payment processor receives from SQS
- [❌] Payments created in database
- [❌] All 4 integration tests pass

**Current Progress**: **3 / 7 criteria met (43%)**

---

## 📞 **CONTACT & SUPPORT**

If upgrading LocalStack doesn't resolve the issue:
1. Check LocalStack GitHub issues for AWS SDK v3 compatibility
2. Review LocalStack documentation for SQS configuration requirements
3. Consider using LocalStack Pro if enterprise support is needed

---

**Report Generated**: 2026-04-25T11:50:00Z  
**Last Test Run**: 2026-04-25T10:45:28Z  
**Docker Containers**: 4 (3 healthy, 1 degraded)
