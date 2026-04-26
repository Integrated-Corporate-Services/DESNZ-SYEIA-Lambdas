# Integration Tests - Modular Structure

## 📁 File Structure

The integration tests have been refactored into a modular structure for better maintainability and reusability:

```
DOC/
├── integration-test.mjs              # Main test runner (orchestrator)
├── integration-test-data.mjs         # Test data, payloads, and configurations
├── integration-test-assertions.mjs   # Validation and assertion functions
├── integration-test-scenarios.mjs    # Test scenario definitions
└── INTEGRATION_TEST_README.md        # This file
```

## 🎯 Module Responsibilities

### 1. **integration-test-data.mjs**
Contains all test data and configurations:
- **Configuration**: API endpoints, database settings, test timeouts
- **Data Generators**: Functions to generate unique payment IDs, webhook IDs
- **Payload Templates**: Reusable webhook payload structures
- **Test Scenarios**: Expected outcomes and test definitions
- **Database Queries**: Parameterized query templates
- **Messages**: Success/error message templates

**Key Exports:**
```javascript
CONFIG                          // Test configuration
generatePaymentId()             // Generate unique payment IDs
generateWebhookId()             // Generate unique webhook IDs
createPaymentWebhookPayload()   // Create standard webhook payloads
TEST_SCENARIOS                  // Test scenario definitions
DB_QUERIES                      // Database query templates
TEST_MESSAGES                   // Success/error messages
```

### 2. **integration-test-assertions.mjs**
Contains all validation and assertion logic:
- **Database Assertions**: Verify records exist and match expected values
- **HTTP Response Assertions**: Verify status codes and responses
- **Idempotency Checks**: Verify duplicate handling behaves correctly
- **Data Integrity**: Verify required fields are present
- **Polling Functions**: Wait for conditions to be met

**Key Exports:**
```javascript
assertWebhookExists()           // Verify webhook in database
assertPaymentExists()           // Verify payment in database
assertPaymentDetails()          // Verify payment matches expected values
assertEventLogged()             // Verify event in event log
assertIdempotentBehavior()      // Comprehensive idempotency check
assertNoDuplicatePayment()      // Verify no duplicate payments created
waitForWebhookStorage()         // Poll until webhook is stored
waitForPaymentCreation()        // Poll until payment is created
```

### 3. **integration-test-scenarios.mjs**
Contains test scenario implementations:
- **Test Execution**: Step-by-step test logic
- **HTTP Operations**: Send webhooks to services
- **Logging**: Formatted output for test progress
- **Scenario Definitions**: Modular, reusable test cases

**Key Exports:**
```javascript
testNewPaymentWebhook()         // Test 1: New payment webhook
testDuplicateConfirmedWebhook() // Test 2: Duplicate confirmed webhook
testDuplicateWebhookId()        // Test 3: Duplicate webhook ID
testInvalidSignature()          // Test 4: Invalid signature rejection
testPaymentCapturedEvent()      // Test 5: Payment captured (optional)
```

### 4. **integration-test.mjs**
Main test runner that orchestrates everything:
- **Setup**: Check services, clean database
- **Execution**: Run test scenarios in sequence
- **Reporting**: Display test results and summary
- **Error Handling**: Catch and report failures

## 🚀 Running Tests

### Prerequisites
```bash
# Start Docker services
cd c:\Users\ChoudhariSushant(ICS\Desktop\work24April\DOC
docker-compose -f docker-compose.integration.yml up -d

# Wait for services to be healthy (15-20 seconds)
```

### Run All Tests
```bash
node integration-test.mjs
```

### Expected Output
```
╔════════════════════════════════════════════════════════════╗
║     Integration Test Suite - E2E Payment Processing       ║
║                   (Modular Version)                        ║
╚════════════════════════════════════════════════════════════╝

🏥 Checking service health...
✅ Inbound receiver is healthy
✅ Database is connected
✅ LocalStack is running
✅ All services are healthy

🔧 Setting up database...
✅ Database cleaned

📝 Test 1: New Payment Webhook
...
✅ Test 1 PASSED: Send a new payment webhook and verify it creates a payment record

📝 Test 2: Duplicate Confirmed Webhook
...
✅ Test 2 PASSED: Send duplicate confirmed webhook to test idempotency

📝 Test 3: Duplicate Webhook ID
...
✅ Test 3 PASSED: Resend same webhook_message_id to test duplicate detection

📝 Test 4: Invalid Signature Rejection
...
✅ Test 4 PASSED: Send webhook with invalid signature

╔════════════════════════════════════════════════════════════╗
║                   ALL TESTS PASSED ✅                      ║
╚════════════════════════════════════════════════════════════╝

✅ 4/4 tests passed
✅ End-to-end flow verified
✅ Idempotency working
✅ Security validation working
```

## 📝 Adding New Tests

### 1. Add Test Data (integration-test-data.mjs)
```javascript
// Add new payload generator
export function createNewEventPayload({ webhookId, paymentId, ... }) {
  return {
    webhook_message_id: webhookId,
    // ... payload structure
  };
}

// Add new test scenario definition
export const TEST_SCENARIOS = {
  newEvent: {
    name: 'New Event Type',
    description: 'Test description',
    expectedStatus: 202,
    // ... expected outcomes
  },
};
```

### 2. Add Assertions (integration-test-assertions.mjs)
```javascript
export async function assertNewBehavior(dbPool, paymentId) {
  // Add validation logic
  const result = await dbPool.query('SELECT ...');
  if (!result.rows.length) {
    throw new Error('Validation failed');
  }
  return result.rows[0];
}
```

### 3. Add Test Scenario (integration-test-scenarios.mjs)
```javascript
export async function testNewEventScenario(dbPool) {
  const scenario = TEST_SCENARIOS.newEvent;
  
  log(`\n📝 Test X: ${scenario.name}`, 'blue');
  log('═'.repeat(60), 'blue');
  
  // Generate test data
  const webhookPayload = createNewEventPayload({ ... });
  
  // Send webhook
  const response = await sendWebhook(webhookPayload, signature, webhookId);
  
  // Assertions
  await assertNewBehavior(dbPool, paymentId);
  
  log(`\n✅ Test X PASSED: ${scenario.description}\n`, 'green');
}
```

### 4. Add to Test Runner (integration-test.mjs)
```javascript
import { testNewEventScenario } from './integration-test-scenarios.mjs';

// In runIntegrationTests()
await testNewEventScenario(dbPool);
testResults.passed++;
```

## 🔍 Benefits of Modular Structure

### ✅ Maintainability
- **Separation of Concerns**: Data, assertions, and scenarios are separated
- **Easy Updates**: Change test data without touching test logic
- **Clear Organization**: Easy to find and modify specific components

### ✅ Reusability
- **Shared Functions**: Assertions and utilities can be reused across tests
- **Consistent Data**: Payload templates ensure consistent test data
- **Common Patterns**: Extract common patterns into reusable functions

### ✅ Testability
- **Unit Testing**: Each module can be unit tested independently
- **Focused Tests**: Scenarios focus on business logic, not plumbing
- **Easy Debugging**: Failures point to specific modules

### ✅ Extensibility
- **Add New Tests**: Simply add new scenarios without duplicating code
- **Custom Assertions**: Add domain-specific assertions
- **Flexible Configuration**: Easy to modify test configurations

## 📊 Test Coverage

Current test scenarios cover:

1. ✅ **New Payment Webhook**: Full payment creation flow
2. ✅ **Duplicate Handling**: Idempotent behavior verification
3. ✅ **Duplicate Detection**: Same webhook_message_id handling
4. ✅ **Security**: Invalid signature rejection
5. ⚠️ **Payment Captured**: Optional, can be enabled

## 🛠️ Troubleshooting

### Tests Fail with "Service not healthy"
```bash
# Check Docker services
docker-compose -f docker-compose.integration.yml ps

# Check inbound-receiver health
curl http://localhost:3000/health
```

### Database Connection Errors
```bash
# Verify PostgreSQL is running
docker logs integration-postgres

# Check database credentials in integration-test-data.mjs
```

### Webhook Signature Failures
```bash
# Verify webhook secret matches
# integration-test-data.mjs: webhookSecret: 'test-signing-key-456'
# Must match GOVPAY_WEBHOOK_SIGNING_KEY in Docker Compose
```

## 📚 Additional Resources

- **GOV.UK Pay Webhook Specification**: https://docs.payments.service.gov.uk/webhooks/
- **Integration Test Documentation**: ../DOC/INTEGRATION_TESTING.md
- **API Testing Guide**: ../DOC/API_TESTING_GUIDE.md

## 🤝 Contributing

When adding new tests:
1. Follow the modular structure
2. Add comprehensive assertions
3. Include clear logging
4. Update this README
5. Test locally before committing
