-- Apply all payment callback migrations to icseip (idempotent)
-- Order: check -> payment_webhooks -> worker tables
--
-- psql example:
--   psql "host=dev-eip-dev....rds.amazonaws.com port=5432 dbname=icseip user=... sslmode=require" \
--     -f migrations/000_check_schema.sql
--   psql ... -f migrations/001_payment_webhooks.sql
--   psql ... -f migrations/002_worker_schema.sql
--   psql ... -f migrations/000_check_schema.sql

\ir 001_payment_webhooks.sql
\ir 002_worker_schema.sql
