# ✅ VERIFIED: SQS-Based Payment Webhook Architecture

## 🎯 Correct Architecture Flow

```
┌─────────────────────┐
│   GOV.UK Pay        │
│   (Webhook)         │
└──────────┬──────────┘
           │ HTTP POST
           ▼
┌─────────────────────┐
│   Backend API       │
│   1. Validate       │
│   2. Check Dedupe   │
│   3. Send to SQS    │
│   4. Return 200 OK  │
└──────────┬──────────┘
           │ SQS Message
           ▼
┌─────────────────────┐
│   SQS Queue         │
│   (FIFO/Standard)   │
└──────────┬──────────┘
           │ Event Source Mapping
           ▼
┌─────────────────────┐
│   Lambda            │
│   (THIS SERVICE)    │
│   1. Process Batch  │
│   2. Update Payment │
│   3. Create Outbox  │
└─────────────────────┘
```

## ✅ What's Configured

### Backend ([paymentWebhookService.ts](../../desnz-syeia-backend-beta/src/services/paymentWebhookService.ts))
- ✅ Receives webhook from GOV.UK Pay (HTTP)
- ✅ Validates signature and payload
- ✅ Checks idempotency
- ✅ Sends to SQS via `sqsService.publishWebhookForLambda()`
- ✅ Returns 200 OK to GOV.UK Pay

### SQS Queue
- Queue receives messages from backend
- Event source mapping triggers Lambda
- Supports FIFO or Standard queues
- DLQ for failed messages

### Lambda (THIS SERVICE)
- ✅ Triggered by SQS event source mapping
- ✅ Processes SQS batch (up to 10 messages)
- ✅ Updates payment status with state machine
- ✅ Creates outbox events for Salesforce
- ✅ Supports partial batch failures

## 🔧 AWS Configuration Required

### 1. SQS Queue
```bash
aws sqs create-queue \
  --queue-name payment-webhooks.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "VisibilityTimeout": "300",
    "MessageRetentionPeriod": "1209600"
  }'
```

### 2. Lambda Event Source Mapping
```bash
aws lambda create-event-source-mapping \
  --function-name payment-webhook-processor \
  --event-source-arn arn:aws:sqs:eu-west-2:ACCOUNT:payment-webhooks.fifo \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures
```

### 3. Lambda IAM Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:eu-west-2:ACCOUNT:payment-webhooks.fifo"
    }
  ]
}
```

## 📨 SQS Message Format

The Lambda receives SQS events with this structure:

```json
{
  "Records": [
    {
      "messageId": "msg-123",
      "receiptHandle": "...",
      "body": "{\"webhook\":{\"type\":\"payment.confirmed\",\"data\":{...}},\"metadata\":{\"webhookId\":\"...\",\"paymentId\":\"...\",\"eventType\":\"payment.confirmed\",\"correlationId\":\"...\",\"receivedAt\":\"2024-01-15T10:30:00Z\",\"source\":\"backend-webhook-service\"}}",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1234567890"
      },
      "messageAttributes": {
        "EventType": {"stringValue": "payment.confirmed"},
        "PaymentId": {"stringValue": "pay_abc123"},
        "WebhookId": {"stringValue": "whk_xyz789"}
      },
      "eventSource": "aws:sqs"
    }
  ]
}
```

## 🚀 Environment Variables

```bash
# Database (for payment updates)
PGHOST=your-rds-host.rds.amazonaws.com
PGPORT=5432
PGDATABASE=appdb
PGUSER=postgres
PGPASSWORD=your_password
PGSSLMODE=require

# AWS Region
AWS_REGION=eu-west-2

# Optional - CloudWatch metrics
CLOUDWATCH_NAMESPACE=PaymentWebhooks
```

## ✅ Benefits of This Architecture

1. **Decoupled**: Backend responds immediately to GOV.UK Pay
2. **Scalable**: SQS buffers traffic spikes
3. **Reliable**: SQS retries failed Lambda invocations automatically
4. **Traceable**: Full correlation ID tracking
5. **Cost-effective**: Pay only for message processing
6. **Simple**: No complex HTTP routing or API Gateway needed

## 🔍 Monitoring

### CloudWatch Logs
- Lambda logs: `/aws/lambda/payment-webhook-processor`
- Look for: `[paymentProcessor] Processing webhook from SQS`

### CloudWatch Metrics
- Lambda invocations
- SQS queue depth
- Failed message count
- Processing duration

### Alarms
```bash
# Queue depth alarm
aws cloudwatch put-metric-alarm \
  --alarm-name payment-webhooks-queue-depth \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold
```

## ✅ Verification Checklist

- [x] Backend sends to SQS (not Lambda directly)
- [x] Lambda triggered by SQS event source mapping
- [x] Lambda processes payment updates (not forwarding)
- [x] No HTTP API Gateway needed
- [x] Partial batch failure support enabled
- [x] DLQ configured for failed messages

## 🧪 Testing

### Send Test Message from Backend
The backend webhook endpoint will automatically send to SQS when it receives a webhook from GOV.UK Pay.

### Manual SQS Test
```bash
aws sqs send-message \
  --queue-url https://sqs.eu-west-2.amazonaws.com/ACCOUNT/payment-webhooks.fifo \
  --message-body '{
    "webhook": {
      "type": "payment.confirmed",
      "data": {
        "id": "test_pay_123",
        "status": "success",
        "amount": 10000,
        "reference": "APP-2024-001"
      }
    },
    "metadata": {
      "webhookId": "test-whk-1",
      "paymentId": "test_pay_123",
      "eventType": "payment.confirmed",
      "correlationId": "test-corr-1",
      "receivedAt": "2024-01-15T10:30:00Z",
      "source": "manual-test"
    }
  }' \
  --message-group-id "test_pay_123" \
  --message-deduplication-id "test-whk-1"
```

## 📚 Related Documentation

- [Backend Webhook Service](../../desnz-syeia-backend-beta/src/services/paymentWebhookService.ts)
- [SQS Service](../../desnz-syeia-backend-beta/src/services/sqsService.ts)
- [Complete Guide](../../doc/SQS_PAYMENT_WEBHOOK_GUIDE.md)
