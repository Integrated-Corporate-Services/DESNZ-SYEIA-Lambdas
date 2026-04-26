# Quick Fix Guide - LocalStack SQS Issue

## Problem
AWS SDK v3 cannot communicate with LocalStack 2.3 SQS service.

## Solution 1: Upgrade LocalStack (RECOMMENDED)

### Step 1: Update docker-compose.integration.yml
```yaml
localstack:
  image: localstack/localstack:3.5  # Use version 3.x or later
  container_name: integration-localstack
  ports:
    - "4566:4566"
  environment:
    - SERVICES=sqs
    - DEBUG=0
    - EAGER_SERVICE_LOADING=1
  volumes:
    - "./localstack-init:/etc/localstack/init/ready.d"
  healthcheck:
    test: ["CMD-SHELL", "curl -f http://localhost:4566/_localstack/health || exit 1"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 10s
  networks:
    - integration-net
```

### Step 2: Restart Services
```powershell
# Stop all services
docker-compose -f docker-compose.integration.yml down

# Remove old LocalStack image
docker rmi localstack/localstack:2.3

# Start all services (will pull new image)
docker-compose -f docker-compose.integration.yml up -d

# Wait for services to be healthy
Start-Sleep -Seconds 15

# Create SQS queue
docker exec integration-localstack awslocal sqs create-queue --queue-name payment-webhook-queue --region eu-west-2

# Run integration test
node integration-test.mjs
```

---

## Solution 2: Add AWS SDK v3 Compatibility Layer

If you cannot upgrade LocalStack, try adding these configurations:

### inbound-event-receiver/src/services/sqsService.ts
```typescript
const sqsClient = new SQSClient({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  forcePathStyle: true,
  disableHostPrefix: true,
  requestHandler: {
    // Add custom request handler for LocalStack
    metadata: { serviceId: 'SQS' },
  },
  useFipsEndpoint: false,
  useDualstackEndpoint: false,
});
```

### DESNZ-SYEIA-Lambdas/payment-processor-webhook/Dockerfile.integration
Update the SQS client config in sqs-poller.js:
```javascript
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'eu-west-2',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localstack:4566',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
  useFipsEndpoint: false,
  useDualstackEndpoint: false,
});
```

---

## Solution 3: Temporary Workaround - Disable SQS

### Step 1: Disable SQS in docker-compose.integration.yml
```yaml
inbound-receiver:
  environment:
    - SQS_ENABLED=false  # Disable SQS
    # ... other vars
```

### Step 2: Add Direct HTTP Trigger to Payment Processor

Add a simple HTTP endpoint that processes webhooks directly from the database:

```javascript
// Add to payment-processor container
import express from 'express';
const app = express();

app.post('/process-pending', async (req, res) => {
  // Query database for pending webhooks
  const result = await pool.query(
    'SELECT * FROM payment_webhooks WHERE status = $1 ORDER BY created_at LIMIT 10',
    ['processing']
  );
  
  // Process each webhook
  for (const webhook of result.rows) {
    const event = {
      Records: [{
        body: webhook.webhook_data,
        messageId: webhook.webhook_id,
      }]
    };
    await handler(event, {});
  }
  
  res.json({ processed: result.rows.length });
});

app.listen(8080);
```

### Step 3: Modify Integration Test
```javascript
// After webhook is stored, trigger processing via HTTP
await fetch('http://localhost:8080/process-pending', { method: 'POST' });
```

---

## Verification Commands

### Check LocalStack Version
```powershell
docker exec integration-localstack localstack --version
```

### Check SQS Queue Exists
```powershell
docker exec integration-localstack awslocal sqs list-queues --region eu-west-2
```

### Test SQS Send/Receive Manually
```powershell
# Send test message
docker exec integration-localstack awslocal sqs send-message `
  --queue-url http://localhost:4566/000000000000/payment-webhook-queue `
  --message-body '{"test":"hello"}' `
  --region eu-west-2

# Receive message
docker exec integration-localstack awslocal sqs receive-message `
  --queue-url http://localhost:4566/000000000000/payment-webhook-queue `
  --region eu-west-2
```

### Check Service Logs
```powershell
# Inbound receiver
docker logs integration-inbound-receiver --tail 50 | Select-String "SQS|error"

# Payment processor
docker logs integration-payment-processor --tail 50 | Select-String "SQS|error"

# LocalStack
docker logs integration-localstack --tail 50 | Select-String "SQS|error"
```

---

## Expected Behavior After Fix

1. **Inbound receiver logs** should show:
   ```
   [SQS] Message sent successfully
   ```

2. **Payment processor logs** should show:
   ```
   📨 Received 1 message(s) from SQS
   ✅ Processing webhook: evt_test_xxx
   ```

3. **Database** should contain:
   ```sql
   -- Webhook with status=success
   SELECT * FROM payment_webhooks WHERE status='success';
   
   -- Payment record
   SELECT * FROM payments WHERE govuk_pay_id='pay_test_xxx';
   ```

4. **Integration test** should pass:
   ```
   ✅ Test 1: New Payment Webhook (payment.created)
   ✅ Test 2: Payment Confirmed
   ✅ Test 3: Duplicate Webhook
   ✅ Test 4: Invalid Signature
   ```

---

## Troubleshooting

### Issue: "Queue does not exist"
**Solution**: Manually create the queue after LocalStack starts:
```powershell
docker exec integration-localstack awslocal sqs create-queue --queue-name payment-webhook-queue --region eu-west-2
```

### Issue: "Connection refused" to LocalStack
**Solution**: Check LocalStack is healthy:
```powershell
docker exec integration-localstack curl http://localhost:4566/_localstack/health
```

### Issue: Services can't resolve "localstack" hostname
**Solution**: Verify all containers are on the same Docker network:
```powershell
docker network inspect work24april_integration-net
```

### Issue: Permission denied errors
**Solution**: Ensure AWS credentials are set:
```yaml
environment:
  - AWS_ACCESS_KEY_ID=test
  - AWS_SECRET_ACCESS_KEY=test
```

---

## Contact

If issues persist after trying all solutions, check:
- LocalStack GitHub: https://github.com/localstack/localstack/issues
- AWS SDK v3 compatibility: https://github.com/aws/aws-sdk-js-v3/issues
- LocalStack documentation: https://docs.localstack.cloud/user-guide/aws/sqs/
