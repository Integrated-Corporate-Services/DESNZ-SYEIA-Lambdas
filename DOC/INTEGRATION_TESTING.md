# Integration Testing Guide

## Overview

This integration testing suite validates the complete end-to-end flow of payment webhook processing using LocalStack, PostgreSQL, and Docker.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Integration Test Suite                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─► 1. Send Webhook
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Inbound Event Receiver (Port 3000)             │
│  • Validates webhook signature                              │
│  • Stores in payment_webhooks table                         │
│  • Queues to SQS                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─► 2. Queue Message
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              LocalStack SQS (Port 4566)                     │
│  • payment-webhook-queue                                    │
│  • Simulates AWS SQS locally                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─► 3. Poll & Process
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          Payment Processor Webhook Lambda                   │
│  • Polls SQS for messages                                   │
│  • Validates signatures                                     │
│  • Updates payments table                                   │
│  • Records in payment_events                                │
│  • Creates outbox records                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─► 4. Store Results
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL (Port 5433)                         │
│  • payment_webhooks                                         │
│  • payments                                                 │
│  • payment_events                                           │
│  • outbox                                                   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software
- **Docker Desktop** (with Docker Compose)
- **Node.js** 18.x or higher
- **PowerShell** 5.1 or higher (Windows) or Bash (Linux/Mac)
- **AWS CLI** (optional, for LocalStack debugging)

### Required Ports
Ensure these ports are available:
- `3000` - Inbound Event Receiver
- `4566` - LocalStack Gateway
- `5433` - PostgreSQL

## Quick Start

### Windows (PowerShell)

```powershell
# 1. Run the integration test suite
.\run-integration-tests.ps1

# The script will:
#   ✅ Check prerequisites
#   ✅ Start all services (LocalStack, PostgreSQL, services)
#   ✅ Wait for services to be healthy
#   ✅ Run integration tests
#   ✅ Display results
```

### Linux/Mac (Bash)

```bash
# 1. Make script executable
chmod +x run-integration-tests.sh

# 2. Run tests
./run-integration-tests.sh
```

## Manual Testing Steps

### 1. Start Services

```bash
# Start all services
docker-compose -f docker-compose.integration.yml up -d --build

# Check status
docker-compose -f docker-compose.integration.yml ps

# View logs
docker-compose -f docker-compose.integration.yml logs -f
```

### 2. Verify Service Health

```bash
# Check inbound receiver
curl http://localhost:3000/health

# Check LocalStack
curl http://localhost:4566/_localstack/health

# Check PostgreSQL
docker exec integration-postgres psql -U integration_user -d integration_db -c "SELECT 1"
```

### 3. Run Integration Tests

```bash
node integration-test.mjs
```

### 4. Stop Services

```bash
# Stop and remove containers (keeps volumes)
docker-compose -f docker-compose.integration.yml down

# Stop and remove everything including data
docker-compose -f docker-compose.integration.yml down -v
```

## Test Cases

### Test 1: New Payment Webhook ✅
- **Description:** Sends a `payment.created` webhook
- **Verifies:**
  - Webhook accepted by inbound-receiver (200/202)
  - Webhook stored in `payment_webhooks` table
  - Message queued to SQS
  - Payment-processor-webhook processes message
  - Payment created in `payments` table
  - Event logged in `payment_events` table

### Test 2: Payment Confirmed Webhook ✅
- **Description:** Sends a `payment.confirmed` webhook for existing payment
- **Verifies:**
  - Webhook processed successfully
  - Payment status updated to `success`
  - `confirmed_at` timestamp set
  - Event count incremented
  - Event history updated

### Test 3: Duplicate Webhook (Idempotency) ✅
- **Description:** Resends same webhook ID twice
- **Verifies:**
  - Duplicate detected by `webhook_id` constraint
  - No duplicate payment created
  - Only one record in `payments` table
  - Idempotency working correctly

### Test 4: Invalid Signature Rejection ✅
- **Description:** Sends webhook with invalid HMAC signature
- **Verifies:**
  - Request rejected with 401/403
  - No database records created
  - Security validation working

## Environment Variables

### Inbound Event Receiver
```bash
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=integration_db
DB_USER=integration_user
DB_PASSWORD=integration_pass

# AWS
AWS_REGION=eu-west-2
AWS_ENDPOINT_URL=http://localstack:4566
SQS_QUEUE_URL=http://localstack:4566/000000000000/payment-webhook-queue

# Security
WEBHOOK_SECRET=test-webhook-secret-123
```

### Payment Processor Webhook
```bash
# Database
PGHOST=postgres
PGPORT=5432
PGDATABASE=integration_db
PGUSER=integration_user
PGPASSWORD=integration_pass

# AWS
AWS_REGION=eu-west-2
AWS_ENDPOINT_URL=http://localstack:4566
WEBHOOK_SQS_QUEUE_URL=http://localstack:4566/000000000000/payment-webhook-queue

# Security
GOVUK_PAY_WEBHOOK_SECRET=test-webhook-secret-123
```

## Debugging

### View Service Logs

```bash
# All services
docker-compose -f docker-compose.integration.yml logs -f

# Specific service
docker-compose -f docker-compose.integration.yml logs -f inbound-receiver
docker-compose -f docker-compose.integration.yml logs -f payment-processor
docker-compose -f docker-compose.integration.yml logs -f postgres
docker-compose -f docker-compose.integration.yml logs -f localstack
```

### Check Database

```bash
# Connect to PostgreSQL
docker exec -it integration-postgres psql -U integration_user -d integration_db

# Check tables
\dt

# Query webhooks
SELECT * FROM payment_webhooks ORDER BY received_at DESC LIMIT 10;

# Query payments
SELECT * FROM payments ORDER BY created_at DESC;

# Query events
SELECT * FROM payment_events ORDER BY received_at DESC LIMIT 10;
```

### Check SQS Queue

```bash
# List queues
aws sqs list-queues --endpoint-url http://localhost:4566 --region eu-west-2

# Get queue attributes
aws sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/payment-webhook-queue \
  --attribute-names All \
  --endpoint-url http://localhost:4566 \
  --region eu-west-2

# Receive messages (test)
aws sqs receive-message \
  --queue-url http://localhost:4566/000000000000/payment-webhook-queue \
  --endpoint-url http://localhost:4566 \
  --region eu-west-2
```

### Manual Webhook Testing

```bash
# Send test webhook
curl -X POST http://localhost:3000/webhooks/payment \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Id: evt_manual_test_123" \
  -H "X-Webhook-Signature: $(echo -n '{"type":"payment.created","data":{"id":"pay_manual_123","amount":1000}}' | openssl dgst -sha256 -hmac 'test-webhook-secret-123' | cut -d ' ' -f2)" \
  -d '{"type":"payment.created","data":{"id":"pay_manual_123","amount":1000},"timestamp":"2026-04-24T10:00:00Z"}'
```

## Troubleshooting

### Services Not Starting
```bash
# Check Docker is running
docker ps

# Check port conflicts
netstat -ano | findstr "3000 4566 5433"

# Remove old containers
docker-compose -f docker-compose.integration.yml down -v
```

### Tests Timeout
- Increase `maxWait` in test script
- Check service logs for errors
- Verify services are healthy: `docker-compose ps`

### Database Connection Failed
```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.integration.yml logs postgres

# Verify credentials
docker exec integration-postgres psql -U integration_user -d integration_db -c "SELECT 1"
```

### SQS Messages Not Processing
```bash
# Check LocalStack logs
docker-compose -f docker-compose.integration.yml logs localstack

# Check payment-processor logs
docker-compose -f docker-compose.integration.yml logs payment-processor

# Verify queue exists
aws sqs list-queues --endpoint-url http://localhost:4566 --region eu-west-2
```

## Performance

- **Test Duration:** ~30-45 seconds
- **Container Startup:** ~30-60 seconds
- **Database Init:** ~5 seconds
- **Total Time:** ~2-3 minutes

## Clean Up

```bash
# Stop services (keep data)
docker-compose -f docker-compose.integration.yml stop

# Remove containers (keep volumes)
docker-compose -f docker-compose.integration.yml down

# Remove everything including data
docker-compose -f docker-compose.integration.yml down -v

# Remove images
docker-compose -f docker-compose.integration.yml down --rmi all -v
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install pg
      
      - name: Run integration tests
        run: |
          chmod +x run-integration-tests.sh
          ./run-integration-tests.sh
```

## Next Steps

1. ✅ Run integration tests locally
2. ✅ Verify all 4 tests pass
3. 🔄 Add to CI/CD pipeline
4. 🔄 Create performance tests
5. 🔄 Add monitoring and alerting

---

**Ready to test?** Run: `.\run-integration-tests.ps1`
