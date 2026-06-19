/**
 * Idempotency Repository Queries
 */

export const idempotencyQueries = {
  findEventById: `
    SELECT * FROM payment_events
    WHERE event_id = $1
  `,

  recordIdempotentEvent: `
    INSERT INTO payment_events (
      event_id,
      payment_id,
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
