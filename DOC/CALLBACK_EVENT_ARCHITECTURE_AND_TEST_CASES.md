# Callback Event & Payment State: Architecture and Test Cases

## 1. Overview
This document explains the Callback Event model, its statuses, and the separation from Payment State, as implemented for GOV.UK Pay integration. It also lists recommended test cases to ensure correctness, auditability, and robustness.

---

## 2. Callback Event Model

A Callback Event represents a single webhook delivery attempt from GOV.UK Pay. It is an immutable, append-only record used for:
- Supporting retries
- Handling out-of-order events
- Providing a full audit trail
- Decoupling ingestion from processing

### Core Fields
| Field           | Description                                  |
|-----------------|----------------------------------------------|
| id              | Internal primary key                         |
| webhook_id      | Unique GOV.UK Pay webhook ID (idempotency)   |
| payment_id      | GOV.UK Pay payment_id                        |
| event_type      | Webhook event type (e.g. PAYMENT_COMPLETED)  |
| event_date      | Timestamp from GOV.UK Pay                    |
| payload         | Full raw webhook JSON                        |
| created_at      | When webhook was received                    |
| enqueued_at     | When sent to queue                           |
| processed_at    | When processing completed                    |
| failed_at       | (Optional) When permanently failed           |
| error           | (Optional) Failure reason                    |

### Status Lifecycle (Derived from Timestamps)
| Status      | Condition                                               |
|-------------|---------------------------------------------------------|
| RECEIVED    | processed_at IS NULL and enqueued_at IS NULL            |
| ENQUEUED    | enqueued_at IS NOT NULL and processed_at IS NULL        |
| PROCESSING  | processing_attempt > 0                                  |
| PROCESSED   | processed_at IS NOT NULL                               |
| FAILED      | failed_at IS NOT NULL                                   |

---

## 3. Payment State

Payment State is a separate, authoritative entity representing the current status of a payment. It is updated only after confirming with the GOV.UK Pay Payments API.

| Payment State | Meaning                |
|---------------|------------------------|
| CREATED       | Payment initiated      |
| IN_PROGRESS   | Payment authorised     |
| COMPLETED     | Payment successful     |
| FAILED        | Payment failed         |
| CANCELLED     | Payment cancelled      |
| EXPIRED       | Payment expired        |
| REFUNDED      | Payment refunded       |

---

## 4. Entity Relationship
- One Payment can have many Callback Events
- Callback Events may arrive out of order, be duplicated, or arrive after payment completion
- Payment state is only updated after authoritative API confirmation

---

## 5. Test Cases

### 5.1 Callback Event Processing
- [ ] Webhook received → Callback Event created with correct fields
- [ ] Duplicate webhook (same webhook_id) does not create duplicate Callback Event
- [ ] Callback Event is immutable (no updates to payload or event_date)
- [ ] Callback Event status transitions are correctly inferred from timestamps
- [ ] Out-of-order events are handled without affecting payment state
- [ ] Retries are recorded and do not overwrite previous attempts
- [ ] Permanent failures are recorded with failed_at and error

### 5.2 Payment State Updates
- [ ] Payment state is only updated after successful GOV.UK Pay API call
- [ ] Payment state is not updated directly from webhook event_type
- [ ] Multiple Callback Events for the same payment do not cause inconsistent state
- [ ] Payment state transitions are valid (no regression to earlier state)

### 5.3 Audit & Compliance
- [ ] Full audit trail of all Callback Events for a payment
- [ ] All status changes are timestamped and immutable
- [ ] Failed events are visible and traceable
- [ ] All fields required for audit are present and populated

### 5.4 Reliability & Idempotency
- [ ] System tolerates duplicate, out-of-order, and late webhook events
- [ ] Idempotency is enforced using webhook_id
- [ ] No payment state update occurs if Callback Event processing fails

---

## 6. References
- GOV.UK Pay Webhook Documentation
- Internal Architecture Review Notes

---

## 7. Summary
This model ensures robust, auditable, and reliable processing of GOV.UK Pay webhooks, with clear separation between event processing and payment state management.
