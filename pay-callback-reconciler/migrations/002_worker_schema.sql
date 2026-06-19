-- Worker / reconciler Lambda schema (icseip database)
-- Reuses existing public.payment + adds payment_events only (no separate payments/outbox tables).
--
-- Prerequisite: public.payment exists (application payment records with payment_id = GOV.UK Pay id).
-- Run after 001_payment_webhooks.sql.

-- ---------------------------------------------------------------------------
-- Extend existing payment table (minimal worker columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- payment_events: idempotency + webhook event history
-- payment_id matches public.payment.payment_id (GOV.UK Pay payment id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_events (
  event_id          TEXT PRIMARY KEY,
  payment_id        TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  event_data        JSONB,
  event_timestamp   TIMESTAMPTZ NOT NULL,
  processed         BOOLEAN NOT NULL DEFAULT false,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id
  ON payment_events (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_order
  ON payment_events (payment_id, event_timestamp, received_at);

COMMENT ON TABLE payment_events IS 'Worker reconciler: webhook idempotency and event history';
