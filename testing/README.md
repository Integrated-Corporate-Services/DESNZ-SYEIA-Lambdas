# Payment Webhook Testing Suite

Comprehensive testing resources for the GOV.UK Pay webhook integration.

## 📁 Contents

- **webhook-testing-collection.postman.json** - Complete Postman collection with all test scenarios
- **webhook-testing-environment.postman_environment.json** - Postman environment for local testing (localhost:3000)
- **webhook-testing-docker.postman_environment.json** - Postman environment for Docker testing (inbound-receiver:3000)
- **ENVIRONMENT_SETUP.md** - Comprehensive guide for Postman environment configuration
- **generate-signatures.mjs** - Utility to generate HMAC-SHA256 signatures for custom payloads
- **PAYLOAD_REFERENCE.md** - Complete reference of all test payloads with signatures

## 🚀 Quick Start

### Import Postman Collection

1. Open Postman
2. Click **Import** button
3. Select `webhook-testing-collection.postman.json`
4. Collection will appear in your workspace

### Import Postman Environment

1. Click **Import** button in Postman
2. Select the environment file:
   - **Local Testing**: `webhook-testing-environment.postman_environment.json` (for localhost:3000)
   - **Docker Testing**: `webhook-testing-docker.postman_environment.json` (for Docker container)
3. Environment will appear in the **Environments** tab
4. Select the environment from the dropdown in the top-right corner

> 📖 **Detailed Setup Guide**: See [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for comprehensive instructions on using and customizing environments.

### Available Environments

#### 1. Webhook Testing - Local
- **Base URL**: http://localhost:3000
- **Use Case**: Testing against locally running service
- **When to Use**: Development and debugging on your local machine

#### 2. Webhook Testing - Docker
- **Base URL**: http://inbound-receiver:3000
- **Use Case**: Testing against Docker Compose services
- **When to Use**: Integration testing with full Docker stack

### Environment Variables

Both environments include these variables:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `base_url` | API base URL | http://localhost:3000 |
| `webhook_endpoint` | Full webhook endpoint | {{base_url}}/callback/payment |
| `health_endpoint` | Health check endpoint | {{base_url}}/health |
| `webhook_secret` | HMAC signing secret | test-signing-key-456 |
| `api_version` | GOV.UK Pay API version | 1 |
| `payment_provider` | Payment provider name | worldpay |
| `default_amount` | Default payment amount (pence) | 10000 |
| `return_url` | Payment return URL | https://example.com/return |
| `payment_id` | Dynamic payment ID (set by tests) | - |
| `webhook_message_id` | Dynamic webhook ID (set by tests) | - |
| `test_reference` | Test reference (set by tests) | - |
| `timestamp` | Timestamp (set by tests) | - |

### Customize Environment Variables

To modify environment variables:
1. Click on **Environments** tab in Postman
2. Select the environment (Local or Docker)
3. Edit variable values:
   - **Initial Value**: Default value stored in environment file
   - **Current Value**: Actual value used during test runs
4. Click **Save**

#### Common Customizations

**Change Base URL**:
```
base_url: http://your-server:3000
```

**Change Webhook Secret**:
```
webhook_secret: your-production-secret
```

**Change Payment Amount**:
```
default_amount: 50000  // £500.00
```

### Run Tests

#### Run Entire Collection
1. Click on collection name
2. Click **Run** button
3. Click **Run Payment Webhook API - Complete Test Suite**

#### Run Individual Test Folder
1. Expand collection
2. Right-click on folder (e.g., "Happy Path - Payment Lifecycle")
3. Select **Run folder**

#### Run Single Test
1. Expand collection to find specific test
2. Click on test name
3. Click **Send** button

## 📊 Test Coverage

### Test Categories

| Category | Tests | Description |
|----------|-------|-------------|
| **Health Check** | 1 | Verify service is running |
| **Happy Path** | 4 | Complete payment lifecycle (Created → Started → Succeeded → Captured) |
| **Failure Scenarios** | 3 | Payment failures (Declined, Insufficient Funds, Cancelled) |
| **Refund Scenarios** | 2 | Refund submission and completion |
| **Validation Errors** | 5 | Invalid signatures, missing fields, malformed JSON, negative amounts |
| **Idempotency** | 2 | Duplicate webhook handling |
| **Terminal State Protection** | 3 | Verify terminal states cannot be changed |

**Total Tests**: 20 scenarios covering all critical paths

### Test Scenarios Detail

#### ✅ Happy Path Tests
1. **Payment Created** - Initial payment creation webhook
2. **Payment Started** - User has started payment
3. **Payment Succeeded** - Payment completed successfully
4. **Payment Captured** - Payment funds captured

#### ❌ Failure Scenarios
1. **Payment Failed - Declined Card** - Card issuer declined payment
2. **Payment Failed - Insufficient Funds** - Not enough funds
3. **Payment Cancelled by User** - User cancelled the payment

#### 💰 Refund Scenarios
1. **Refund Submitted** - Refund request submitted
2. **Refund Succeeded** - Refund completed successfully

#### 🔒 Validation Errors
1. **Invalid Signature** - Wrong HMAC signature (should return 401)
2. **Missing Signature Header** - No Pay-Signature header (should return 401)
3. **Missing Required Fields** - Incomplete payload (should return 400)
4. **Malformed JSON** - Invalid JSON syntax (should return 400)
5. **Invalid Payment Amount** - Negative amount (should return 400)

#### 🔁 Idempotency Tests
1. **Duplicate Webhook - First Request** - First webhook processed normally
2. **Duplicate Webhook - Second Request** - Duplicate handled idempotently (200 OK)

#### 🛡️ Terminal State Protection
1. **Create Payment** - Initial payment creation
2. **Payment Failed** - Move to terminal FAILED state
3. **Attempt Update** - Try to change from FAILED to SUCCESS (should be rejected with 400/409)

## 🔐 Signatures

All payloads have pre-calculated HMAC-SHA256 signatures using the test webhook secret: `test-signing-key-456`

### Signature Algorithm
```
signature = HMAC-SHA256(payload_body, webhook_secret)
```

### Generate Custom Signatures

If you create new test payloads, use the signature generator:

```bash
cd testing
node generate-signatures.mjs
```

Or calculate manually:
```javascript
const crypto = require('crypto');
const secret = 'test-signing-key-456';
const payload = JSON.stringify(yourPayload);
const signature = crypto.createHmac('sha256', secret)
  .update(payload, 'utf-8')
  .digest('hex');
```

## 📝 Expected Results

### Successful Requests (200 OK)
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

### Authentication Errors (401 Unauthorized)
```json
{
  "success": false,
  "error": "Invalid webhook signature"
}
```

### Validation Errors (400 Bad Request)
```json
{
  "success": false,
  "error": "Invalid payload: missing required fields"
}
```

### Terminal State Protection (409 Conflict)
```json
{
  "success": false,
  "error": "Cannot update payment in terminal state"
}
```

## 🧪 Testing Best Practices

### 1. Test Order
Run tests in this order:
1. Health Check (ensure service is running)
2. Happy Path (establish baseline functionality)
3. Failure Scenarios (test error handling)
4. Validation Errors (test security)
5. Idempotency (test duplicate handling)
6. Terminal State Protection (test state machine)

### 2. Clean State
For idempotency and terminal state tests, ensure database is in clean state or use unique payment IDs.

### 3. Monitor Logs
Watch application logs while running tests to see detailed processing:
```bash
docker-compose -f docker-compose.integration.yml logs -f inbound-receiver
```

### 4. Verify Database
After tests, verify database records:
```sql
-- Check webhook records
SELECT * FROM payment_webhooks ORDER BY created_at DESC LIMIT 10;

-- Check payment records
SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;

-- Check event log
SELECT * FROM payment_events ORDER BY created_at DESC LIMIT 10;
```

## 🔍 Debugging Failed Tests

### Test Fails with 401 Unauthorized
- Check `Pay-Signature` header is present
- Verify webhook secret matches server configuration
- Ensure payload JSON matches exactly (no extra spaces/newlines)

### Test Fails with 400 Bad Request
- Verify all required fields are present
- Check JSON syntax is valid
- Ensure data types are correct (amount is number, not string)

### Test Fails with 500 Internal Server Error
- Check application logs for detailed error
- Verify database is accessible
- Ensure all services are running (use health check endpoint)

### Idempotency Test Fails
- Clear database between test runs
- Ensure webhook IDs are unique
- Check application logs for duplicate detection logic

## 📚 Additional Resources

- **API Documentation**: See `../DOC/API_TESTING_GUIDE.md`
- **Integration Tests**: See `../DOC/integration-test.mjs`
- **Test Architecture**: See `../inbound-event-receiver/tests/README.md`
- **GOV.UK Pay Webhooks**: https://docs.payments.service.gov.uk/webhooks/

## 🎯 Success Criteria

A complete test run should show:
- ✅ All health checks pass
- ✅ Happy path completes (4/4 tests pass)
- ✅ Invalid signatures rejected (401)
- ✅ Missing fields rejected (400)
- ✅ Duplicate webhooks handled idempotently (200)
- ✅ Terminal states protected (400/409)
- ✅ Database records created correctly
- ✅ SQS messages published

## 🐛 Troubleshooting

### Services Not Running
```bash
cd ../DOC
docker-compose -f docker-compose.integration.yml up -d
```

### Database Connection Issues
```bash
# Check database container
docker-compose -f docker-compose.integration.yml ps

# View database logs
docker-compose -f docker-compose.integration.yml logs postgres
```

### Reset Everything
```bash
# Stop all services and remove volumes
docker-compose -f docker-compose.integration.yml down -v

# Restart services
docker-compose -f docker-compose.integration.yml up -d --build

# Wait for services to be ready
sleep 15
```

## 📞 Support

For issues or questions:
1. Check application logs
2. Review test documentation
3. Verify environment configuration
4. Check database state

## 🔄 Quick Reference

### Switch Environments in Postman
1. Click environment dropdown (top-right)
2. Select **Webhook Testing - Local** or **Webhook Testing - Docker**
3. Run tests

### Test Against Different Servers
1. Duplicate an environment
2. Rename it (e.g., "Webhook Testing - Staging")
3. Update `base_url` variable
4. Update `webhook_secret` if needed
5. Select new environment and run tests

### Generate Signature for Custom Payload
```bash
cd testing
node generate-signatures.mjs
```

### Quick Health Check
```bash
# Local
curl http://localhost:3000/health

# Docker
curl http://inbound-receiver:3000/health
```

### View Current Environment Variables
In Postman, click the "eye" icon (👁️) next to the environment dropdown to see all current variable values.

---

**Last Updated**: April 2024  
**Webhook Secret**: test-signing-key-456  
**Base URL (Local)**: http://localhost:3000  
**Base URL (Docker)**: http://inbound-receiver:3000

