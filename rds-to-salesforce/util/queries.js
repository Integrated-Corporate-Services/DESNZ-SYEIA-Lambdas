// queries.js
export const SQL_CLAIM_BATCH = `
  WITH c AS (
    SELECT outbox_id
    FROM application_outbox
    WHERE status IN ($1, $2)
      AND attempt_count < $3
      AND next_attempt_at <= NOW()
    ORDER BY created_at
    LIMIT $4
    FOR UPDATE SKIP LOCKED
  )
  UPDATE application_outbox o
  SET status = $5,
      attempt_count = attempt_count + 1
  FROM c
  WHERE o.outbox_id = c.outbox_id
  RETURNING o.outbox_id, o.application_id, o.payload_snapshot_json, o.attempt_count, o.event_type;
`;

export const SQL_MARK_DIRECT_SUCCESS_OUTBOX = `
  UPDATE application_outbox
     SET status = $2, sent_at = NOW(), last_error_message = NULL, salesforce_record_id = $3
   WHERE outbox_id = $1
`;

export const SQL_MARK_DIRECT_SUCCESS_APP = `
  UPDATE application
     SET salesforce_record_id = $2
   WHERE application_id = $1
`;

export const SQL_MARK_APPFLOW_HANDOFF = `
  UPDATE application_outbox
     SET status = $2, handoff_s3_key = $3, last_error_message = NULL
   WHERE outbox_id = $1
`;

export const SQL_MARK_FAILURE = `
  UPDATE application_outbox
     SET status = $2,
         last_error_message = $3,
         next_attempt_at = COALESCE($4::timestamptz, next_attempt_at)
   WHERE outbox_id = $1
`;
