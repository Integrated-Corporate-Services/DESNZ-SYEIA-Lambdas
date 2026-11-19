export const INSERT_ADDITIONAL_PAYMENT_EVENT = `INSERT INTO additional_payment_event
(application_id, payment_id, payment_reference, amount, description, source_event_id, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
ON CONFLICT (source_event_id) DO NOTHING
RETURNING additional_payment_event_id`;

export const FIND_ADDITIONAL_PAYMENT_EVENT_BY_SOURCE_EVENT_ID = `SELECT additional_payment_event_id FROM additional_payment_event
WHERE source_event_id = $1
LIMIT 1`;
