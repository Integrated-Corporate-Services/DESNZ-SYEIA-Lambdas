# ⚡ Enhanced Payment Webhook Handler Lambda

> AWS Lambda for handling **all 6 GOV.UK Pay webhook events** with **enterprise-grade out-of-order event resilience**

---

## 📋 Supported Events

| Event | Status | Description |
|-------|--------|-------------|
| ✅ **payment.confirmed** | Initial | Payment authorized and confirmed |
| 📦 **payment.captured** | Processing | Payment funds captured from customer |
| ✅✅ **payment.settled** | Final | Payment settled into merchant account |
| ❌ **payment.failed** | Terminal | Payment processing failed |
| ⏰ **payment.expired** | Terminal | Payment link expired |
| 💳 **payment.refunded** | Final | Payment refunded to customer |

---

## 🎯 Key Features

- ✅ **Out-of-Order Resilience** - Handles events arriving in any sequence
- 🔄 **State Machine** - Enforces valid transitions between payment states
- 🔒 **Idempotency** - Prevents duplicate processing of same event
- 🛡️ **Signature Verification** - HMAC-SHA256 validation for all webhooks
- 📊 **Event History** - Complete tracking of all payment lifecycle events
- ⚡ **High Performance** - Optimized for low-latency processing
- 📈 **Observable** - CloudWatch metrics and structured logging
- 🔗 **Salesforce Ready** - Outbox pattern for reliable integration

---

## 📊 Payment State Machine

```
              ┌──────────────┐
              │    PENDING   │
              └──────┬───────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
      CONFIRMED   FAILED    EXPIRED
          │
          ▼
      CAPTURED
          │
          ▼
      SETTLED
          │
          ▼
      REFUNDED

State Transitions:
• PENDING → CONFIRMED (on confirmed event)
• PENDING → FAILED (on failed event)
• PENDING → EXPIRED (on expired event)
• CONFIRMED → CAPTURED (on captured event)
• CAPTURED → SETTLED (on settled event)
• SETTLED → REFUNDED (on refunded event)
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- PostgreSQL RDS instance
- GOV.UK Pay API credentials
- AWS Lambda permissions

### Installation

```powershell
npm install
```

### Configuration

Create a `.env` file or set AWS Lambda environment variables:

```env
# ╔═══════════════════════════════════════╗
# ║     DATABASE CONFIGURATION            ║
# ╚═══════════════════════════════════════╝
PGHOST=your-rds-host.rds.amazonaws.com
PGPORT=5432
PGDATABASE=appdb
PGUSER=postgres
PGPASSWORD=your_secure_password
PGSSLMODE=require

# ╔═══════════════════════════════════════╗
# ║     GOV.UK PAY CONFIGURATION          ║
# ╚═══════════════════════════════════════╝
GOVUK_PAY_WEBHOOK_SECRET=your_webhook_signing_secret_key
GOVUK_API_KEY=your_api_key

# ╔═══════════════════════════════════════╗
# ║     APPLICATION SETTINGS              ║
# ╚═══════════════════════════════════════╝
LOG_LEVEL=info                # debug, info, warn, error
ENVIRONMENT=production        # development, staging, production
ENABLE_METRICS=true
```

### Deployment

```powershell
# Build the project
npm run build

# Deploy to AWS Lambda
npm run deploy

# Deploy with custom stage
npm run deploy -- --stage prod
```

---

## 🧪 Testing

```powershell
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Run specific test suite
npm test -- payment.test.js

# Watch mode for development
npm test -- --watch

# Run integration tests only
npm test -- --testPathPattern=integration
```

---

## 📁 Project Structure

```
payment-processor-webhook/
│
├── handler.js                     ◄── Lambda entry point
├── webhookService.js              ◄── Webhook orchestration logic
├── paymentProcessor.js            ◄── Business logic (ENHANCED)
│
├── stateManagement/               ◄── State machine & event processing
│   ├── stateMachine.js           ─── Valid state transitions
│   ├── eventProcessor.js         ─── Out-of-order event handling
│   └── transitionValidator.js    ─── Transition validation
│
├── validators/                    ◄── Input validation
│   ├── signatureValidator.js     ─── HMAC-SHA256 verification
│   ├── payloadValidator.js       ─── Webhook payload validation
│   └── eventValidator.js         ─── Event-specific validation
│
├── database/                      ◄── Data persistence layer
│   ├── repository.js             ─── Database operations
│   ├── paymentRepository.js      ─── Payment queries
│   └── eventRepository.js        ─── Event history queries
│
├── util/                          ◄── Shared utilities
│   ├── logger.js                 ─── Structured logging
│   ├── database.js               ─── Connection pooling
│   ├── metrics.js                ─── CloudWatch metrics
│   └── helpers.js                ─── Helper functions
│
└── tests/                         ◄── Test suites
    ├── unit/
    ├── integration/
    └── fixtures/
```

---

## 🔄 Out-of-Order Event Handling

### The Problem
GOV.UK Pay webhooks can arrive out of order due to network latency, retries, or asynchronous processing.

### The Solution
```
Timeline: Events Arrive Out of Order
┌──────────────────────────────────────────┐
│ T+0ms    → settled event                │  ← Arrives FIRST!
│ T+100ms  → captured event               │
│ T+200ms  → confirmed event              │  ← Arrives LAST!
└──────────────────────────────────────────┘

Processing Logic:
┌─────────────────────────────────────────────┐
│ 1️⃣  settled arrives                         │
│    ✓ Store in event_history                 │
│    ✓ Mark as processed                      │
│                                             │
│ 2️⃣  captured arrives                        │
│    ✓ Add to event_history                   │
│    ✓ Re-derive state from ALL events        │
│                                             │
│ 3️⃣  confirmed arrives                       │
│    ✓ Add to event_history                   │
│    ✓ Re-derive state from ALL events        │
│    ✓ Validate transitions are valid         │
└─────────────────────────────────────────────┘

✅ Final Result: SETTLED (CORRECT!)
   Event History: [confirmed → captured → settled]
   Status derived from complete event sequence
```

---

## 📈 CloudWatch Monitoring

### Metrics Emitted

```
Name                              │ Type      │ Description
──────────────────────────────────┼───────────┼─────────────────────────
payment.webhook.processed         │ Counter   │ Total webhooks processed
payment.webhook.success           │ Counter   │ Successfully processed
payment.webhook.error             │ Counter   │ Processing errors
payment.webhook.latency           │ Duration  │ End-to-end latency (ms)
payment.state.confirmed           │ Counter   │ Confirmed payments
payment.state.captured            │ Counter   │ Captured payments
payment.state.settled             │ Counter   │ Settled payments
payment.state.failed              │ Counter   │ Failed payments
payment.state.expired             │ Counter   │ Expired payments
payment.state.refunded            │ Counter   │ Refunded payments
payment.ooo.reprocessed           │ Counter   │ Out-of-order reprocessing
payment.ooo.conflicts             │ Counter   │ Invalid state transitions
```

### Dashboards

Set up CloudWatch dashboards to monitor:
- Real-time webhook processing rate
- Error frequency and types
- Payment state distribution
- Out-of-order event frequency
- End-to-end latency percentiles

---

## 🗄️ Database Schema

### payments table
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  govuk_payment_id VARCHAR(255) UNIQUE NOT NULL,
  amount_pence INTEGER NOT NULL,
  state VARCHAR(50) NOT NULL,
  reference VARCHAR(255),
  return_url TEXT,
  description TEXT,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_event_at TIMESTAMP
);
```

### payment_events table
```sql
CREATE TABLE payment_events (
  id SERIAL PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_timestamp TIMESTAMP NOT NULL,
  sequence_order INTEGER,
  UNIQUE(payment_id, event_type)
);
```

See [OUT_OF_ORDER_EVENTS_GUIDE.md](../OUT_OF_ORDER_EVENTS_GUIDE.md) for complete schema with indices and optimization tips.

---

## 📚 Documentation

| Document | Link | Purpose |
|----------|------|---------|
| 📖 **Out-of-Order Events Guide** | [OUT_OF_ORDER_EVENTS_GUIDE.md](../OUT_OF_ORDER_EVENTS_GUIDE.md) | Complete implementation details |
| 📖 **Webhook Handler Guide** | [PAYMENT_WEBHOOK_HANDLER_GUIDE.md](../PAYMENT_WEBHOOK_HANDLER_GUIDE.md) | Original design documentation |
| 📖 **Lambda Enhancement Guide** | [ENHANCED_LAMBDA_GUIDE.md](../ENHANCED_LAMBDA_GUIDE.md) | Enhancement details |
| 📖 **Deployment Checklist** | [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md) | Pre-deployment verification |

---

## 🔍 Debugging

### Enable Debug Logging
```powershell
$env:LOG_LEVEL = "debug"
npm test
```

### Check Event History
```sql
SELECT * FROM payment_events 
WHERE payment_id = 'your-payment-id'
ORDER BY processed_at ASC;
```

### Validate State Transitions
```javascript
const { validateTransition } = require('./stateManagement/transitionValidator');
const valid = validateTransition('CONFIRMED', 'CAPTURED');
console.log(valid); // true or false
```

---

## ⚙️ Advanced Configuration

### Custom Event Processors
Extend `eventProcessor.js` to add custom business logic:

```javascript
const processor = new EventProcessor("payment_id", eventData);
await processor.processEvent(eventType);
```

### Metrics Integration
Use CloudWatch Insights for advanced querying:

```sql
fields @timestamp, @message, state, event_type
| stats count() by state
| sort count() desc
```

---

## ✨ Performance Tips

1. **Connection Pooling** - Reuse database connections
2. **Batch Events** - Process multiple events in parallel where possible
3. **Archive Events** - Archive old events to maintain query performance
4. **Index Strategy** - Ensure indices on `payment_id`, `event_type`, `processed_at`

---

## 🤝 Contributing

1. Write tests for new features
2. Maintain code coverage above 80%
3. Follow the existing code style
4. Document complex logic
5. Update this README for significant changes

---

## 📄 License

See LICENCE file in the repository

---

## 🆘 Support

For issues:
1. Check the documentation links above
2. Review CloudWatch logs in AWS Console
3. Enable debug logging for detailed traces
4. Check database schema integrity

**Last Updated:** April 2026 | **Status:** Production Ready ✅
# Enhanced Payment Webhook Handler Lambda

AWS Lambda for handling **all 6 GOV.UK Pay webhook events** with **out-of-order event resilience**.

## Supported Events

âœ… **payment.confirmed** - Payment authorized and confirmed  
ðŸ“¦ **payment.captured** - Payment funds captured from customer  
âœ…âœ… **payment.settled** - Payment settled into merchant account  
âŒ **payment.failed** - Payment processing failed  
â° **payment.expired** - Payment link expired  
ðŸ’³ **payment.refunded** - Payment refunded to customer  

## Key Features

âœ… Handles events in **any order**  
âœ… **State machine** with valid transitions  
âœ… **Idempotency** (no duplicate processing)  
âœ… **Signature verification** (HMAC-SHA256)  
âœ… **Complete event history** tracking  
âœ… **Out-of-order resilience**  
âœ… **CloudWatch metrics** and **structured logs**  
âœ… **Salesforce integration** via outbox pattern  

## State Machine

\\\
       PENDING
         â”‚ â”‚ â”‚
    â”Œâ”€â”€â”€â”€â”€â”¼â”€â”¼â”€â”€â”€â”€â”€â”
    â”‚     â”‚ â”‚     â”‚
    â†“     â†“ â†“     â†“
 CONFIRMED FAILED EXPIRED
    â†“
 CAPTURED
    â†“
 SETTLED
    â†“
 REFUNDED
\\\

## Setup

\\\powershell
npm install
\\\

## Environment Variables

\\\env
PGHOST=your-rds-host
PGPORT=5432
PGDATABASE=appdb
PGUSER=postgres
PGPASSWORD=password
PGSSLMODE=require
GOVUK_PAY_WEBHOOK_SECRET=your_webhook_signing_secret
LOG_LEVEL=info
ENVIRONMENT=production
\\\

## Database Schema

See [OUT_OF_ORDER_EVENTS_GUIDE.md](../OUT_OF_ORDER_EVENTS_GUIDE.md) for SQL including:
- payments table
- payment_events table (with event history)

## Deployment

\\\powershell
npm run deploy
\\\

## Testing

\\\powershell
npm test
npm test -- --watch
\\\

## File Structure

- **handler.js** - Lambda entry point
- **webhookService.js** - Webhook orchestration
- **paymentProcessor.js** - Business logic (ENHANCED)
- **stateManagement/** - State machine and event processor
  - stateMachine.js - Valid transitions
  - eventProcessor.js - Out-of-order logic
- **validators/** - Signature and payload validation
- **database/** - Repository layer
- **util/** - Logger, database, metrics

## How Out-of-Order Handling Works

`
Events arrive in wrong order:
  T+0ms:  settled (arrives first!)
  T+100ms: captured
  T+200ms: confirmed

Lambda processes:
  1. settled arrives â†’ Track in event history
  2. captured arrives â†’ Add to history, re-derive state
  3. confirmed arrives â†’ Add to history, re-derive state

Final state: SETTLED (correctly!)
  Event history: [confirmed, captured, settled]
  Status derived from ALL events, not affected by order
`

## Monitoring

CloudWatch Metrics:
- payment.webhook.processed
- payment.webhook.payment.confirmed
- payment.webhook.payment.captured
- payment.webhook.payment.settled
- payment.webhook.payment.failed
- payment.webhook.payment.expired
- payment.webhook.payment.refunded
- payment.webhook.error

## See Also

- [OUT_OF_ORDER_EVENTS_GUIDE.md](../OUT_OF_ORDER_EVENTS_GUIDE.md) - Complete out-of-order handling documentation
- [PAYMENT_WEBHOOK_HANDLER_GUIDE.md](../PAYMENT_WEBHOOK_HANDLER_GUIDE.md) - Original guide
