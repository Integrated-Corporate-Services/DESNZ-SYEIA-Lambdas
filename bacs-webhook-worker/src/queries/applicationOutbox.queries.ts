import { APPLICATION_OUTBOX_TABLE, APPLICATION_OUTBOX_STATUS } from '../constants/applicationOutbox.constants';

export const applicationOutboxQueries = {
  INSERT_BACS_PAYMENT_EVENT: `
    INSERT INTO ${APPLICATION_OUTBOX_TABLE} (
      application_id,
      event_type,
      payload_snapshot_json,
      idempotency_key,
      status,
      attempt_count,
      next_attempt_at,
      created_at,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      '${APPLICATION_OUTBOX_STATUS.PENDING}',
      0,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (event_type, idempotency_key) DO NOTHING
    RETURNING outbox_id
  `,

  FIND_EXISTING_BY_IDEMPOTENCY_KEY: `
    SELECT outbox_id
      FROM ${APPLICATION_OUTBOX_TABLE}
     WHERE idempotency_key = $1
     LIMIT 1
  `,
};
