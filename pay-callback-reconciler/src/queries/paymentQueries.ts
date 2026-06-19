/**
 * Payment Repository Queries
 * Uses existing public.payment (payment_id = GOV.UK Pay id).
 */

export const paymentQueries = {
  findByPaymentId: `
    SELECT * FROM payment
    WHERE payment_id = $1
  `,

  getPaymentEvents: `
    SELECT * FROM payment_events
    WHERE payment_id = $1
    ORDER BY event_timestamp ASC, received_at ASC
  `,

  recordPaymentEvent: `
    INSERT INTO payment_events (
      event_id,
      payment_id,
      event_type,
      event_data,
      event_timestamp,
      received_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING *
  `,
};

/**
 * Allowed fields for payment updates (SQL injection prevention).
 * Minimal set — event detail lives in payment_events.
 */
export const ALLOWED_UPDATE_FIELDS = [
  'status',
  'amount',
  'reference',
  'description',
  'finished',
] as const;

export type AllowedUpdateField = typeof ALLOWED_UPDATE_FIELDS[number];
