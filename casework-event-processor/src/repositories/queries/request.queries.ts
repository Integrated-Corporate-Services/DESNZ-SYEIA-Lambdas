export const INSERT_FURTHER_INFORMATION_REQUEST = `INSERT INTO further_information_request
(application_id, request_text, deadline_at, external_request_id, raised_by_source, created_at, updated_at, recipient_type, recipient_party_id)
VALUES ($1, $2, $3, $4, $5, $6, $6, $7,
  (SELECT ap.application_party_id FROM application_party ap
   WHERE ap.application_id = $1
     AND ap.role = ANY(CASE WHEN $7::text = 'OBJECTOR' THEN ARRAY['OBJECTOR', 'REPRESENTATIVE'] ELSE ARRAY['APPLICANT', 'AGENT'] END)
   ORDER BY ap.is_primary DESC, (ap.role = 'APPLICANT') DESC
   LIMIT 1))
RETURNING further_information_request_id`;

export const LOCK_FURTHER_INFORMATION_REQUEST_BY_EXTERNAL_ID = `SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text || ':' || $2::text, 0))`;

export const FIND_FURTHER_INFORMATION_REQUEST_BY_EXTERNAL_ID = `SELECT further_information_request_id FROM further_information_request
WHERE application_id = $1 AND external_request_id = $2
LIMIT 1`;