export const applicationOutboxQueries = {
  createPaymentStatusNotification: `
    INSERT INTO application_outbox (
      application_id,
      event_type,
      payload_snapshot_json,
      status,
      attempt_count,
      next_attempt_at,
      created_at,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      'PENDING',
      0,
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING outbox_id
  `,
};
