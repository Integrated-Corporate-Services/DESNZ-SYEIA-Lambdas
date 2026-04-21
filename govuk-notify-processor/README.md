# GOV.UK Notify Processor Lambda

AWS Lambda function that processes email send requests from the backend via SQS and sends them using GOV.UK Notify API.

## 🎯 Architecture

```
Backend → SQS Queue → Lambda → GOV.UK Notify API → Update DB
```

### Flow

1. **Backend publishes email request** to SQS queue
2. **SQS triggers Lambda** via event source mapping
3. **Lambda validates** the SQS message
4. **Lambda calls GOV.UK Notify API** to send email
5. **Lambda updates database** with result (sent/failed)
6. **Returns batch failures** for SQS retry

---

## 📦 Components

- **handler.js** - Main Lambda handler (SQS event processor)
- **services/notifyService.js** - GOV.UK Notify API client
- **database/emailRequestRepository.js** - PostgreSQL repository
- **util/database.js** - PostgreSQL connection pool
- **util/logger.js** - Winston logger
- **util/metrics.js** - CloudWatch metrics
- **util/secrets.js** - Secrets Manager client
- **util/helpers.js** - Utility functions

---

## 🔧 Environment Variables

```bash
# GOV.UK Notify
NOTIFY_API_URL=https://api.notifications.service.gov.uk
NOTIFY_API_KEY_SECRET=/notify/api-key
NOTIFY_API_TIMEOUT=10000
NOTIFY_MAX_RETRIES=3
NOTIFY_BACKOFF_MS=2000

# Database (RDS PostgreSQL)
PGHOST=your-rds-host.rds.amazonaws.com
PGPORT=5432
PGDATABASE=appdb
PGUSER=postgres
PGPASSWORD=your_password
PGSSLMODE=require
DB_POOL_MAX=10

# AWS
AWS_REGION=eu-west-2

# Logging
LOG_LEVEL=info

# Metrics
CLOUDWATCH_NAMESPACE=GovUKNotify
METRICS_ENABLED=true
```

---

## 📊 Database Schema

The Lambda requires these tables (see `desnz-syeia-backend-beta/src/database/schema/notify.sql`):

```sql
-- Email requests table
CREATE TABLE notify_email_requests (
  id SERIAL PRIMARY KEY,
  request_id VARCHAR(255) UNIQUE NOT NULL,
  correlation_id VARCHAR(255),
  reference VARCHAR(255) UNIQUE,
  email_address VARCHAR(320) NOT NULL,
  template_id VARCHAR(255) NOT NULL,
  personalisation JSONB,
  notification_id VARCHAR(255),
  status VARCHAR(50) NOT NULL, -- pending, sent, failed
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMP,
  failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📨 SQS Message Format

Backend publishes messages to SQS with this structure:

```json
{
  "requestId": "req-123",
  "correlationId": "corr-456",
  "reference": "user-123-email-2024-04-21",
  "emailAddress": "user@example.gov.uk",
  "templateId": "template-uuid",
  "personalisation": {
    "name": "John Smith",
    "reference_number": "REF-2024-001"
  },
  "metadata": {
    "userId": "123",
    "applicationId": "456"
  }
}
```

---

## 🚀 Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Package Lambda

```bash
npm run deploy
# Creates lambda.zip
```

### 3. Deploy to AWS

```bash
aws lambda create-function \
  --function-name govuk-notify-processor \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT_ID:role/lambda-notify-role \
  --handler handler.handler \
  --zip-file fileb://lambda.zip \
  --timeout 60 \
  --memory-size 512 \
  --environment Variables="{
    NOTIFY_API_KEY_SECRET=/notify/api-key,
    PGHOST=your-rds-host.rds.amazonaws.com,
    PGDATABASE=appdb,
    PGUSER=postgres,
    PGPASSWORD=your_password,
    PGSSLMODE=require,
    LOG_LEVEL=info,
    AWS_REGION=eu-west-2
  }"
```

### 4. Create Event Source Mapping

```bash
aws lambda create-event-source-mapping \
  --function-name govuk-notify-processor \
  --event-source-arn arn:aws:sqs:eu-west-2:ACCOUNT_ID:notify-email-requests.fifo \
  --batch-size 10 \
  --maximum-batching-window-in-seconds 5 \
  --function-response-types ReportBatchItemFailures
```

---

## 📊 CloudWatch Metrics

Custom metrics emitted:

- `NotifyEmailsSent` - Count of successful sends
- `NotifyEmailsFailed` - Count of permanent failures
- `NotifyRetries` - Count of retry attempts
- `NotifyInvalidRequests` - Count of invalid SQS messages

---

## 🔍 Monitoring

### CloudWatch Logs

```sql
-- Find successful sends
fields @timestamp, correlationId, notificationId, reference
| filter message like /Email sent successfully/
| sort @timestamp desc

-- Find failures
fields @timestamp, correlationId, error
| filter level = "error"
| sort @timestamp desc
```

### CloudWatch Alarms

Recommended alarms:

1. **High Failure Rate**: `NotifyEmailsFailed > 10 per 5 min`
2. **Lambda Errors**: `Errors > 5 per 5 min`
3. **DLQ Depth**: `ApproximateNumberOfMessagesVisible > 0`

---

## 🐛 Troubleshooting

### Email not sent

1. Check CloudWatch Logs for errors
2. Check DLQ for failed messages
3. Verify API key in Secrets Manager
4. Check database connection

### Database errors

1. Verify RDS security groups
2. Check database credentials
3. Ensure tables exist (run schema script)

### High retry count

1. Check GOV.UK Notify API status
2. Review error messages in logs
3. Check rate limits (3000/min)

---

## 📖 Related Documentation

- [Backend Webhook Service](../../desnz-syeia-backend-beta/src/services/notifyWebhookService.ts)
- [Database Schema](../../desnz-syeia-backend-beta/src/database/schema/notify.sql)
- [GOV.UK Notify Docs](https://docs.notifications.service.gov.uk)

---

**Status**: ✅ Production Ready  
**Owner**: DESNZ Cloud Integration Team
