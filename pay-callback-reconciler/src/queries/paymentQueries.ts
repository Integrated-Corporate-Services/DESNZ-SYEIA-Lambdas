/**
 * Payment Repository Queries
 * All SQL queries for payment operations
 */

export const paymentQueries = {
  // SELECT queries
  findByGovukPayId: `
    SELECT * FROM payments 
    WHERE govuk_pay_id = $1
  `,

  getPaymentEvents: `
    SELECT * FROM payment_events 
    WHERE govuk_pay_id = $1 
    ORDER BY event_timestamp ASC, received_at ASC
  `,

  // INSERT queries
  createPayment: `
    INSERT INTO payments (
      govuk_pay_id, 
      reference, 
      amount, 
      status, 
      description, 
      created_at, 
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
    RETURNING *
  `,

  recordPaymentEvent: `
    INSERT INTO payment_events (
      event_id, 
      govuk_pay_id, 
      event_type, 
      event_data, 
      event_timestamp, 
      received_at
    ) VALUES ($1, $2, $3, $4, $5, NOW()) 
    RETURNING *
  `,

  // UPDATE queries
  // Note: updatePayment is dynamically constructed due to variable fields
  // See paymentRepository for implementation
  updatePaymentBase: `
    UPDATE payments 
    SET {setClauses}, updated_at = NOW() 
    WHERE govuk_pay_id = ${'{lastParam}'} 
    RETURNING *
  `,
};

/**
 * Allowed fields for payment updates (SQL injection prevention)
 */
export const ALLOWED_UPDATE_FIELDS = [
  'status',
  'event_history',
  'event_count',
  'last_event_type',
  'confirmed_at',
  'captured_at',
  'settled_at',
  'failed_at',
  'expired_at',
  'refunded_at',
  'amount',
  'reference',
  'description',
  'transaction_id',
  'capture_amount',
  'settled_amount',
  'refund_amount',
  'failure_reason',
  'failure_code',
] as const;

export type AllowedUpdateField = typeof ALLOWED_UPDATE_FIELDS[number];
