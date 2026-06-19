-- Payment webhooks table (payment ECS + relay Lambda)
-- Safe to re-run. Usually already applied in dev via payment service.
-- Source: desnz-syeia-payment-service/src/database/001_create_payment_webhooks.sql

CREATE TABLE IF NOT EXISTS payment_webhooks (
  id SERIAL PRIMARY KEY,
  webhook_id TEXT UNIQUE NOT NULL,
  payment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_payload JSONB NOT NULL,
  enqueued_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_webhook_id
  ON payment_webhooks (webhook_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_payment_id
  ON payment_webhooks (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status
  ON payment_webhooks (status);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at
  ON payment_webhooks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_enqueued_at
  ON payment_webhooks (enqueued_at)
  WHERE enqueued_at IS NULL AND status = 'pending';

-- Backfill column if table existed before relay migration
ALTER TABLE payment_webhooks
  ADD COLUMN IF NOT EXISTS enqueued_at TIMESTAMPTZ;

COMMENT ON TABLE payment_webhooks IS
  'Inbound GOV.UK Pay webhooks — payment ECS writes, relay polls enqueued_at IS NULL';
