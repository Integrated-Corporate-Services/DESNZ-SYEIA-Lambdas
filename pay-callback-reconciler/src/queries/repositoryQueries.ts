/**
 * Idempotency Repository Queries
 * SQL queries for idempotency checking and event tracking
 */

export const idempotencyQueries = {
  findEventById: `
    SELECT * FROM payment_events 
    WHERE event_id = $1
  `,

  recordIdempotentEvent: `
    INSERT INTO payment_events (
      event_id, 
      govuk_pay_id, 
      event_type, 
      event_data, 
      event_timestamp, 
      processed, 
      received_at
    ) VALUES ($1, $2, $3, $4, $5, false, NOW())
    ON CONFLICT(event_id) DO NOTHING
    RETURNING event_id
  `,
};

/**
 * Outbox Repository Queries
 * SQL queries for outbox pattern (reliable event publishing)
 */

export const outboxQueries = {
  createOutboxRecord: `
    INSERT INTO outbox (
      aggregate_id, 
      aggregate_type, 
      event_type, 
      payload, 
      created_at
    ) VALUES ($1, $2, $3, $4, $5) 
    RETURNING id
  `,

  getUnprocessedRecords: `
    SELECT * FROM outbox 
    WHERE processed_at IS NULL 
    AND (failed_at IS NULL OR retry_count < 3)
    ORDER BY created_at ASC 
    LIMIT $1
  `,

  markRecordProcessed: `
    UPDATE outbox 
    SET processed_at = NOW() 
    WHERE id = $1
  `,

  markRecordFailed: `
    UPDATE outbox 
    SET failed_at = NOW(), 
        retry_count = retry_count + 1, 
        error_message = $2 
    WHERE id = $1
  `,
};
