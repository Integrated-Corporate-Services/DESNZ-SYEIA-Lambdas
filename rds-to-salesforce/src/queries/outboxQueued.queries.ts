export const SQL_MARK_SQS_ENQUEUED = `
  UPDATE application_outbox
     SET status = $2, attempt_count = 0, last_error_message = NULL, updated_at = NOW()
   WHERE outbox_id = $1
`;
