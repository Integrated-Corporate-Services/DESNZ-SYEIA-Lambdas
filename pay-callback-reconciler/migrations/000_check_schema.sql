-- Diagnostic: list payment callback tables in icseip (read-only)

-- Run: psql -h <host> -U <user> -d icseip -f migrations/000_check_schema.sql



\echo '=== Public tables (payment-related) ==='

SELECT table_name

FROM information_schema.tables

WHERE table_schema = 'public'

  AND table_type = 'BASE TABLE'

  AND table_name LIKE '%payment%'

ORDER BY table_name;



\echo ''

\echo '=== Required worker tables ==='

SELECT

  required.name AS table_name,

  CASE WHEN t.table_name IS NOT NULL THEN 'present' ELSE 'MISSING' END AS status

FROM (

  VALUES

    ('payment_webhooks'),

    ('payment'),

    ('payment_events')

) AS required(name)

LEFT JOIN information_schema.tables t

  ON t.table_schema = 'public'

 AND t.table_type = 'BASE TABLE'

 AND t.table_name = required.name

ORDER BY required.name;



\echo ''

\echo '=== payment columns (reused worker state) ==='

SELECT column_name, data_type, is_nullable

FROM information_schema.columns

WHERE table_schema = 'public' AND table_name = 'payment'

ORDER BY ordinal_position;



\echo ''

\echo '=== payment_events columns (worker idempotency) ==='

SELECT column_name, data_type, is_nullable

FROM information_schema.columns

WHERE table_schema = 'public' AND table_name = 'payment_events'

ORDER BY ordinal_position;



\echo ''

\echo '=== payment_webhooks columns (payment service + relay) ==='

SELECT column_name, data_type, is_nullable

FROM information_schema.columns

WHERE table_schema = 'public' AND table_name = 'payment_webhooks'

ORDER BY ordinal_position;

