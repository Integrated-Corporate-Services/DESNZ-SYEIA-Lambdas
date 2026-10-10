export const INSERT_INTEGRATION_INBOX_EVENT = `INSERT INTO integration_inbox
(source_event_id, source_system, event_type, schema_version, application_id, application_type, correlation_id, case_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (source_event_id) DO NOTHING`;

export const UPDATE_INTEGRATION_INBOX_PROCESSED = `UPDATE integration_inbox
SET status = 'PROCESSED',
processed_at = COALESCE(processed_at, NOW())
WHERE source_event_id = $1`;