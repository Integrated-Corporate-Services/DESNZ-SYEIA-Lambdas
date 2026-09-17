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
    RETURNING outbox_id
  `,

  FIND_EXISTING_BY_IDEMPOTENCY_KEY: `
    SELECT outbox_id
      FROM ${APPLICATION_OUTBOX_TABLE}
     WHERE idempotency_key = $1
     LIMIT 1
  `,

  // idempotency_key has no unique constraint (idx_outbox_idempotency is not
  // unique), so ON CONFLICT cannot target it. This transaction-scoped advisory
  // lock serialises concurrent deliveries of the same key instead.
  LOCK_IDEMPOTENCY_KEY: `
    SELECT pg_advisory_xact_lock(hashtext($1))
  `,
};
