-- Migration: Add enqueued_at column to payment_webhooks
ALTER TABLE payment_webhooks ADD COLUMN IF NOT EXISTS enqueued_at TIMESTAMP;
