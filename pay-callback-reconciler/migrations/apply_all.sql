-- Apply reconciler worker schema to icseip (idempotent)
-- Prerequisite: public.payment + payment_webhooks (from payment service)
--
--   psql "host=... dbname=icseip user=... sslmode=require" -f migrations/apply_all.sql

\ir 001_worker_schema.sql
