# Postman Environment Setup Guide

Quick guide for setting up and using Postman environments for webhook testing.

## 🚀 Quick Setup (2 minutes)

### Step 1: Import Collection
1. Open Postman
2. Click **Import**
3. Drag & drop `webhook-testing-collection.postman.json`
4. ✅ Collection imported!

### Step 2: Import Environment
1. Click **Import** again
2. Drag & drop **ONE** of these files:
   - `webhook-testing-environment.postman_environment.json` (for localhost)
   - `webhook-testing-docker.postman_environment.json` (for Docker)
3. ✅ Environment imported!

### Step 3: Select Environment
1. Look at top-right corner of Postman
2. Click environment dropdown (shows "No Environment")
3. Select **Webhook Testing - Local** or **Webhook Testing - Docker**
4. ✅ Ready to test!

### Step 4: Run Your First Test
1. Expand collection → **Health Check**
2. Click **Health Check - Should Return 200**
3. Click **Send** button
4. ✅ Should see 200 OK response!

---

## 📋 Environment Details

### Local Environment
**File**: `webhook-testing-environment.postman_environment.json`

```
Base URL: http://localhost:3000
Webhook Secret: test-signing-key-456
Use Case: Testing against locally running Node.js service
```

**When to use**:
- Running service locally with `npm start`
- Debugging in VS Code
- Development mode

**Start service**:
```bash
cd inbound-event-receiver
npm install
npm start
```

---

### Docker Environment
**File**: `webhook-testing-docker.postman_environment.json`

```
Base URL: http://inbound-receiver:3000
Webhook Secret: test-signing-key-456
Use Case: Testing against Docker Compose services
```

**When to use**:
- Full integration testing
- Testing with real database
- Testing with SQS (LocalStack)

**Start services**:
```bash
cd DOC
docker-compose -f docker-compose.integration.yml up -d --build
```

---

## 🔧 Environment Variables Explained

### Core Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `base_url` | http://localhost:3000 | Main API endpoint |
| `webhook_secret` | test-signing-key-456 | HMAC signing key |

### Endpoint Variables (Auto-generated)

| Variable | Value | Description |
|----------|-------|-------------|
| `webhook_endpoint` | {{base_url}}/callback/payment | Full webhook URL |
| `health_endpoint` | {{base_url}}/health | Health check URL |

### GOV.UK Pay Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `api_version` | 1 | GOV.UK Pay API version |
| `payment_provider` | worldpay | Payment provider name |

### Test Data Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `default_amount` | 10000 | £100.00 in pence |
| `return_url` | https://example.com/return | Payment return URL |

### Dynamic Variables (Set by Tests)

| Variable | Description |
|----------|-------------|
| `payment_id` | Current payment ID being tested |
| `webhook_message_id` | Current webhook message ID |
| `test_reference` | Test reference number |
| `timestamp` | Request timestamp |

---

## ✏️ Customizing Variables

### Method 1: Edit Environment (Permanent)

1. Click **Environments** tab (left sidebar)
2. Select environment to edit
3. Update variable values
4. Click **Save**

**Example: Change to Staging Server**
```
Initial Value: http://localhost:3000
New Value: https://webhook-staging.example.com
```

### Method 2: Override in Collection (Temporary)

1. Click on collection name
2. Go to **Variables** tab
3. Add variable with same name
4. Collection variable overrides environment variable

### Method 3: Use Postman Scripts

Set variables dynamically in **Pre-request Script**:
```javascript
// Generate dynamic payment ID
const paymentId = `pay_${Date.now()}`;
pm.environment.set("payment_id", paymentId);

// Generate timestamp
const timestamp = new Date().toISOString();
pm.environment.set("timestamp", timestamp);
```

---

## 🎯 Common Scenarios

### Scenario 1: Test Against Local Service

1. Start local service:
   ```bash
   cd inbound-event-receiver
   npm start
   ```

2. Select environment: **Webhook Testing - Local**

3. Run tests

**Expected**: Service on http://localhost:3000

---

### Scenario 2: Test Against Docker Services

1. Start Docker stack:
   ```bash
   cd DOC
   docker-compose -f docker-compose.integration.yml up -d
   ```

2. Select environment: **Webhook Testing - Docker**

3. Run tests

**Expected**: Service in Docker network

---

### Scenario 3: Test Against Remote Server

1. Duplicate **Local** environment
2. Rename to "Webhook Testing - Staging"
3. Update variables:
   ```
   base_url: https://webhook-api.staging.example.com
   webhook_secret: staging-secret-key-xyz
   ```
4. Select new environment
5. Run tests

**Expected**: Service on remote server

---

### Scenario 4: Test with Different Webhook Secret

1. Click environment dropdown → Select environment
2. Click eye icon (👁️) to view variables
3. Find `webhook_secret`
4. Click edit icon
5. Update **Current Value**: `your-new-secret`
6. Run tests

**Note**: This only changes the secret for signature generation, not the server's expected secret.

---

## 🔐 Using Variables in Requests

### In URL
```
{{base_url}}/callback/payment
{{webhook_endpoint}}
{{health_endpoint}}
```

### In Headers
```
Pay-Signature: {{calculated_signature}}
Content-Type: application/json
```

### In Request Body
```json
{
  "amount": {{default_amount}},
  "return_url": "{{return_url}}",
  "payment_id": "{{payment_id}}"
}
```

### In Pre-request Scripts
```javascript
const baseUrl = pm.environment.get("base_url");
const secret = pm.environment.get("webhook_secret");
const amount = pm.environment.get("default_amount");
```

### In Test Scripts
```javascript
pm.test("Base URL is correct", function() {
  const expectedUrl = pm.environment.get("base_url");
  pm.expect(pm.request.url.host).to.include(expectedUrl);
});
```

---

## 🔍 Viewing Current Variables

### Method 1: Environment Quick Look
1. Click eye icon (👁️) next to environment dropdown
2. See all variables and their current values

### Method 2: Environments Tab
1. Click **Environments** tab (left sidebar)
2. Select environment
3. View **Initial Value** and **Current Value** for each variable

### Method 3: Console
1. Open Postman Console (View → Show Postman Console)
2. Run a request
3. See all variables in console output

---

## 🧪 Testing Different Configurations

### Test Matrix

| Environment | Base URL | Database | SQS | Use Case |
|-------------|----------|----------|-----|----------|
| Local | localhost:3000 | Optional | No | Quick dev tests |
| Docker | inbound-receiver:3000 | Yes | Yes | Full integration |
| Staging | staging.example.com | Yes | Yes | Pre-production |
| Production | api.example.com | Yes | Yes | Production (caution!) |

### Switch Quickly

**Keyboard Shortcut** (Postman Desktop):
- Windows/Linux: `Ctrl + Alt + E`
- Mac: `Cmd + Option + E`

Opens environment selector for quick switching!

---

## 🐛 Troubleshooting

### Issue: "Could not send request"

**Cause**: Service not running or wrong URL

**Solution**:
1. Check environment selected (top-right)
2. Verify `base_url` variable value
3. Check service is running:
   ```bash
   # Local
   curl http://localhost:3000/health
   
   # Docker
   docker ps | grep inbound-receiver
   ```

---

### Issue: "Invalid signature" (401 error)

**Cause**: Webhook secret mismatch

**Solution**:
1. Check environment variable `webhook_secret`
2. Verify server is using same secret
3. Check server logs for expected secret

---

### Issue: Environment not showing in dropdown

**Cause**: Environment not imported or hidden

**Solution**:
1. Click **Environments** tab (left sidebar)
2. Check if environment exists
3. If not, re-import environment file
4. If exists, ensure it's not archived

---

### Issue: Variables showing as "undefined"

**Cause**: Environment not selected or variable doesn't exist

**Solution**:
1. Select environment from dropdown (top-right)
2. Click eye icon to verify variable exists
3. Check variable name spelling in request

---

## 📚 Advanced Usage

### Create Environment from Template

```javascript
// In Postman, create new environment with this JSON:
{
  "name": "Custom Environment",
  "values": [
    {
      "key": "base_url",
      "value": "http://your-server:3000",
      "enabled": true
    },
    {
      "key": "webhook_secret",
      "value": "your-secret",
      "type": "secret",
      "enabled": true
    }
  ]
}
```

### Export Modified Environment

1. Click **Environments** tab
2. Click ⋯ (three dots) next to environment
3. Select **Export**
4. Save as `.postman_environment.json`
5. Share with team

### Use Environment Variables in Collection Runner

1. Click collection → **Run**
2. Select environment from dropdown
3. Click **Run Payment Webhook API**
4. All tests use environment variables automatically

---

## ✅ Checklist

Before running tests, verify:

- [ ] Postman collection imported
- [ ] Environment imported (Local or Docker)
- [ ] Environment selected in dropdown (top-right)
- [ ] Service is running (check health endpoint)
- [ ] `base_url` points to correct server
- [ ] `webhook_secret` matches server configuration
- [ ] Database is accessible (for integration tests)

---

## 🎓 Learning Resources

- **Postman Environments**: https://learning.postman.com/docs/sending-requests/managing-environments/
- **Postman Variables**: https://learning.postman.com/docs/sending-requests/variables/
- **GOV.UK Pay Webhooks**: https://docs.payments.service.gov.uk/webhooks/

---

**Quick Command Reference**:

```bash
# Start local service
cd inbound-event-receiver && npm start

# Start Docker services
cd DOC && docker-compose -f docker-compose.integration.yml up -d

# Check service health
curl http://localhost:3000/health

# Generate signatures
cd testing && node generate-signatures.mjs
```

**Remember**: Always select the correct environment before running tests!

