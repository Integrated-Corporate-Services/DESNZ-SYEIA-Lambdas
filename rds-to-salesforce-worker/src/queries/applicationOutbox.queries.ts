export const SQL_FIND_BY_OUTBOX_ID = `SELECT * FROM application_outbox WHERE outbox_id = $1`;

export const SQL_MARK_SENT = `
  UPDATE application_outbox
     SET status = 'SENT',
         salesforce_record_id = $2,
         last_response_payload = $3,
         last_error_code = NULL,
         last_error_message = NULL,
         updated_at = NOW()
   WHERE outbox_id = $1
`;

export const SQL_RECORD_FAILED_ATTEMPT = `
  UPDATE application_outbox
     SET attempt_count = attempt_count + 1,
         last_error_code = $2,
         last_error_message = $3,
         last_response_payload = $4,
         status = CASE WHEN attempt_count + 1 >= $5 THEN 'FATAL' ELSE status END,
         updated_at = NOW()
   WHERE outbox_id = $1
   RETURNING attempt_count, status
`;

export const SQL_MARK_FATAL = `
  UPDATE application_outbox
     SET status = 'FATAL',
         last_error_code = $2,
         last_error_message = $3,
         last_response_payload = $4,
         updated_at = NOW()
   WHERE outbox_id = $1
`;
