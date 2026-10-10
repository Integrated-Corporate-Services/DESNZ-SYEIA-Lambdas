export const INSERT_FURTHER_INFORMATION_REQUEST = `INSERT INTO further_information_request
(application_id, request_text, deadline_at, external_request_id, raised_by_source, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $6)
RETURNING further_information_request_id`;

export const INSERT_FURTHER_INFORMATION_REQUEST_CATEGORY = `INSERT INTO further_information_request_category
(further_information_request_id, document_category, display_order)
VALUES ($1, $2, $3)`;