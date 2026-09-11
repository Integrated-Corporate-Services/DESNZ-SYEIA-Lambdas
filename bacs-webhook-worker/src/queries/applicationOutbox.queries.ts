import { APPLICATION_OUTBOX_TABLE, APPLICATION_OUTBOX_STATUS } from '../constants/applicationOutbox.constants';

// Mirrors payment-service/DESNZ-SYEIA-Lambdas/pay-callback-reconciler/src/queries/applicationOutboxQueries.ts
// and desnz-syeia-backend-beta/src/repositories/submitApplicationRepository.js#insertOutboxEvent,
// which both write to the shared `application_outbox` table (schema: database-migrations/sql/V1.2__application_core.sql).
export const applicationOutboxQueries = {
  insertBacsPaymentEvent: `
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

  findExistingByIdempotencyKey: `
    SELECT outbox_id
      FROM ${APPLICATION_OUTBOX_TABLE}
     WHERE idempotency_key = $1
     LIMIT 1
  `,
};
