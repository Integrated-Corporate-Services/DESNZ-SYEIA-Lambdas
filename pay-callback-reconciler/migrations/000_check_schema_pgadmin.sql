-- pgAdmin: compare icseip schema vs pay-callback-reconciler (payment + payment_events only)

SELECT required.table_name,
       CASE WHEN t.table_name IS NOT NULL THEN 'present' ELSE '*** MISSING ***' END AS status
FROM (VALUES ('payment_webhooks'), ('payment'), ('payment_events')) AS required(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name = required.table_name
ORDER BY required.table_name;

WITH expected AS (
  SELECT * FROM (VALUES
    ('payment', 'payment_id'), ('payment', 'status'), ('payment', 'amount'),
    ('payment', 'reference'), ('payment', 'description'), ('payment', 'finished'),
    ('payment', 'updated_at'),
    ('payment_events', 'event_id'), ('payment_events', 'payment_id'),
    ('payment_events', 'event_type'), ('payment_events', 'event_data'),
    ('payment_events', 'event_timestamp'), ('payment_events', 'processed'), ('payment_events', 'received_at')
  ) AS e(table_name, column_name)
)
SELECT e.table_name, e.column_name,
       CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM information_schema.tables t
           WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name = e.table_name
         ) THEN 'table missing'
         WHEN c.column_name IS NULL THEN '*** column MISSING ***'
         ELSE 'present'
       END AS status
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.table_name AND c.column_name = e.column_name
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name = e.table_name
) OR c.column_name IS NULL
ORDER BY e.table_name, e.column_name;
