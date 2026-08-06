# Pay-Callback-Relay Webhook Processing Issue

## Issue Summary
Webhook records in `payment_webhooks` table were being automatically re-enqueued when `enqueued_at` was manually set to NULL, but processing logs couldn't be found in CloudWatch.

## Root Cause
The webhook processing architecture has 3 tiers:
1. **inbound-event-receiver** (payment-service) → Stores webhook with `status='pending'`, `enqueued_at=NULL`
2. **pay-callback-relay** (scheduler lambda) → Polls DB, sends to SQS, sets `enqueued_at=NOW()`
3. **pay-callback-reconciler** (worker lambda) → Processes from SQS, updates payment state

The issue had multiple causes:

### 1. Incomplete Update Query
The `pay-callback-relay` was using:
```sql
UPDATE payment_webhooks SET enqueued_at = NOW() WHERE webhook_id = $1
```

**Problems:**
- Missing `updated_by` field
- Missing `updated_at` field  
- No race condition protection

### 2. Webhook Already Processed
The webhook `6m3og0lk5l1hv4dke43no6uafr` had:
- `enqueued_at = '2026-07-18 20:37:12.659571+00'` (already sent to SQS)
- `status = 'pending'` (should have been updated to 'processed' or 'failed')

This indicates the reconciler either:
- Failed to process it (check DLQ)
- Processed it but didn't update status (bug in reconciler)

### 3. Log Search Strategy
User was searching by `correlation_id` in relay logs, but should search by:
- `webhook_id` for relay logs
- `payment_id` or `webhook_id` for reconciler logs
- Time range: Around `enqueued_at` timestamp

## Solution

### Code Fix Applied
Updated [pay-callback-relay/src/repositories/webhookRepository.ts](DESNZ-SYEIA-Lambdas/pay-callback-relay/src/repositories/webhookRepository.ts):

```typescript
export async function markWebhookEnqueued(webhookId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ${TABLE_PAYMENT_WEBHOOKS} 
     SET enqueued_at = NOW(), 
         updated_at = NOW(), 
         updated_by = 'pay-callback-relay'
     WHERE webhook_id = $1 
       AND enqueued_at IS NULL`,  // Prevents double-processing
    [webhookId]
  );
}
```

**Improvements:**
- ✅ Sets `updated_at` and `updated_by` for audit trail
- ✅ Adds `AND enqueued_at IS NULL` condition to prevent race conditions
- ✅ Aligns with `bacs-webhook-relay` implementation

### Investigation Steps
Created `troubleshoot-webhook-90.ps1` script that:
1. Searches pay-callback-relay logs (around enqueued_at time)
2. Searches pay-callback-reconciler logs (after enqueued_at)
3. Checks SQS Dead Letter Queue for failed messages
4. Provides database queries to check payment state
5. Recommends next steps based on findings

## Common Issues

### Webhook Stuck in 'pending' After Relay
**Symptom:** `enqueued_at` is set, but `status='pending'`

**Causes:**
1. **Reconciler failed** → Check DLQ for messages
2. **Reconciler not triggered** → Verify SQS event source mapping
3. **Processing error** → Check reconciler logs for exceptions
4. **Status not updated** → Bug in reconciler's success path

**Fix:** Reconciler should update webhook status to 'processed' or 'failed'

### Automatic Re-enqueuing When Setting enqueued_at to NULL
**Symptom:** User sets `enqueued_at=NULL`, it immediately becomes current timestamp

**Cause:** pay-callback-relay runs on schedule (every 1-5 minutes typically)

**Why it happens:**
```sql
-- Relay query picks up any webhook with enqueued_at = NULL
SELECT * FROM payment_webhooks
WHERE enqueued_at IS NULL AND status = 'pending'
ORDER BY created_at ASC LIMIT 10
```

**Solution:** Don't manually reset `enqueued_at`. Instead:
1. Check if webhook is in DLQ → Reprocess from DLQ
2. If not in DLQ but not processed → Check reconciler logs
3. If need to retry → Use proper retry mechanism (TBD)

### Can't Find Logs in CloudWatch
**Symptom:** Searching by correlation_id returns no results

**Solution:**
```bash
# Search relay logs
Log Group: /aws/lambda/{env}-EIP-pay-cb-rcvr-relay-EIP-{env}
Filter: webhook_id (e.g., "6m3og0lk5l1hv4dke43no6uafr")
Time: Around enqueued_at timestamp ±5 minutes

# Search reconciler logs
Log Group: /aws/lambda/{env}-EIP-pay-cb-reconciler-EIP-{env}
Filter: webhook_id OR payment_id
Time: After enqueued_at timestamp

# Check DLQ
aws sqs receive-message --queue-url {DLQ_URL}
```

## Monitoring Recommendations

### Metrics to Track
1. **Relay Lambda:**
   - Webhooks polled per run
   - Webhooks successfully enqueued to SQS
   - SQS send failures

2. **Reconciler Lambda:**
   - Messages processed from SQS
   - Processing successes/failures
   - Status update failures

3. **Database:**
   - Count of webhooks with `enqueued_at NOT NULL AND status='pending'` (stuck webhooks)
   - Age of oldest unprocessed webhook

### Alerts to Create
```sql
-- Stuck webhooks (enqueued but not processed after 10 minutes)
SELECT COUNT(*) FROM payment_webhooks
WHERE enqueued_at IS NOT NULL 
  AND status = 'pending'
  AND enqueued_at < NOW() - INTERVAL '10 minutes';
```

## Related Files
- [pay-callback-relay/src/repositories/webhookRepository.ts](DESNZ-SYEIA-Lambdas/pay-callback-relay/src/repositories/webhookRepository.ts)
- [bacs-webhook-relay/src/queries/paymentWebhooks.queries.ts](DESNZ-SYEIA-Lambdas/bacs-webhook-relay/src/queries/paymentWebhooks.queries.ts) (reference implementation)
- [payment-service/src/constants/sql.constants.ts](desnz-syeia-payment-service/src/constants/sql.constants.ts)
- [troubleshoot-webhook-90.ps1](troubleshoot-webhook-90.ps1) (investigation script)

## Deployment Required
After deploying the updated `pay-callback-relay` code:
1. Lambda will properly set `updated_by` field
2. Race conditions will be prevented with `AND enqueued_at IS NULL`
3. Audit trail will be complete with `updated_at`

## Testing Checklist
- [ ] Deploy updated pay-callback-relay
- [ ] Verify relay sets all three fields (enqueued_at, updated_at, updated_by)
- [ ] Verify reconciler updates webhook.status after processing
- [ ] Test DLQ handling for permanent failures
- [ ] Verify logs contain correlation_id for tracing
- [ ] Add monitoring for stuck webhooks
