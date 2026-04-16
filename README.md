
# DESNZ-SYEIA Lambda Functions

## Overview

This repository contains a collection of AWS Lambda functions that support various backend operations for our application. Each Lambda is organized in its own folder, making it easy to manage, update, and deploy individual functions. This structure enables modular development and simplifies integration with our CI/CD pipeline.

## Folder Structure

```
/
|--addGroupToTokenGeneration
|--addUserToEndUserGroup
|--approveUser
|--listCognitoUsers
|--login
|--payment-webhook-handler-enhanced
|--rds-s3-trigger
|--rds-to-salesforce
|--register
|--trigger-appflow-lambda
|--README.md
```

## Lambda Functions

### payment-webhook-handler-enhanced

**Purpose:** Handles GOV.UK Pay webhook events for payment processing with out-of-order event resilience.

**Features:**
- ✅ Handles all 6 GOV.UK Pay event types:
  - `payment.confirmed` - Payment authorized
  - `payment.captured` - Funds captured from customer
  - `payment.settled` - Settled to merchant account
  - `payment.failed` - Payment declined
  - `payment.expired` - Payment link expired
  - `payment.refunded` - Payment refunded

- ✅ **Out-of-Order Event Resilience** - Events can arrive in any order, status derived from complete event history
- ✅ State machine with valid transition rules
- ✅ Event history tracking (JSONB)
- ✅ Idempotency enforcement (UUID-based)
- ✅ HMAC-SHA256 signature verification
- ✅ Structured logging (Winston) & CloudWatch metrics
- ✅ Salesforce integration via outbox pattern
- ✅ Production-grade error handling

**Key Architecture:**
- State Management: `stateManagement/stateMachine.js` - Valid transitions
- Out-of-Order Logic: `stateManagement/eventProcessor.js` - Event history derivation
- Enhanced Processor: `paymentProcessor.js` - Integrates state machine
- Database Layer: PostgreSQL repository with event history tracking
- Validators: HMAC-SHA256 signature verification, payload validation
- Utilities: Logger (Winston), Database pool, CloudWatch metrics

**Quick Start:**
```bash
cd payment-webhook-handler-enhanced
npm install
npm test
npm run deploy
```

**Documentation:**
- `README.md` - Setup and configuration
- `../ENHANCED_LAMBDA_GUIDE.md` - Complete implementation (2000+ lines)
- `../OUT_OF_ORDER_EVENTS_GUIDE.md` - Out-of-order algorithm & scenarios
- `../DEPLOYMENT_CHECKLIST.md` - 10-step deployment guide

**Database Schema:**
Requires RDS updates:
- `payments` table: Add `event_history` JSONB, event timestamps, transaction details
- `payment_events` table: New table for audit trail with UUID-based idempotency

**Environment Variables:**
```
PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
GOVUK_PAY_WEBHOOK_SECRET
LOG_LEVEL=info
ENVIRONMENT=production
```

**Deployment:**
1. Database migration (add event_history fields)
2. npm install
3. Set AWS Lambda environment variables
4. npm run deploy
5. Configure API Gateway webhook endpoint
6. Register webhook in GOV.UK Pay dashboard

---

### rds-to-salesforce

**Purpose:** Integrates RDS database changes with Salesforce CRM via outbox pattern.

---

### Other Lambdas

- `addGroupToTokenGeneration` - Cognito group management
- `addUserToEndUserGroup` - User group assignment
- `approveUser` - User approval workflow
- `listCognitoUsers` - List Cognito users
- `login` - Login handler
- `rds-s3-trigger` - RDS to S3 data export
- `register` - User registration
- `trigger-appflow-lambda` - AppFlow integration
