-- Demo tables for additional-payment-event-processor.
-- Stand-ins for whatever real payment ledger / application tables this lambda
-- will eventually write to, scoped so this lambda doesn't depend on assumptions
-- about the shared backend schema. Replace once the real design is confirmed.

-- Idempotency inbox, dedicated to this lambda (mirrors the inbox pattern used
-- by casework-event-processor's integration_inbox, but not sharing that table).
CREATE TABLE IF NOT EXISTS additional_payment_inbox (
    source_event_id   text PRIMARY KEY,
    source_system     text NOT NULL,
    event_type        text NOT NULL,
    schema_version    text NOT NULL,
    application_id    uuid NOT NULL,
    application_type  text NOT NULL,
    correlation_id    text NULL,
    case_id           text NULL,
    status            text NOT NULL DEFAULT 'RECEIVED',
    received_at       timestamptz NOT NULL DEFAULT NOW(),
    processed_at      timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_additional_payment_inbox_application_id
    ON additional_payment_inbox (application_id);

-- Demo table recording the processed event itself - a single row per additional
-- payment event, replacing the real request/audit/notification chain for now.
CREATE TABLE IF NOT EXISTS additional_payment_event (
    additional_payment_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      uuid NOT NULL,
    payment_id           text NOT NULL,
    payment_reference    text NOT NULL,
    amount                integer NOT NULL,
    description           text NOT NULL,
    source_event_id       text NOT NULL UNIQUE,
    created_at            timestamptz NOT NULL DEFAULT NOW(),
    updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_additional_payment_event_application_id
    ON additional_payment_event (application_id);
