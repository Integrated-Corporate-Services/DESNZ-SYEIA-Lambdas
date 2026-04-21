import { query } from '../util/database.js';

export async function findByGovukPayId(govukPayId) {
  const result = await query(
    'SELECT * FROM payments WHERE govuk_pay_id = $1',
    [govukPayId]
  );
  return result.rows[0] || null;
}

/**
 * Get all payment events (for state derivation)
 */
export async function getPaymentEvents(govukPayId) {
  const result = await query(
    'SELECT * FROM payment_events WHERE govuk_pay_id = $1 ORDER BY sequence_number ASC',
    [govukPayId]
  );
  return result.rows || [];
}

/**
 * Update payment with out-of-order handling
 */
export async function updatePaymentWithOrdering(govukPayId, updates) {
  const setClauses = Object.keys(updates)
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const values = [...Object.values(updates), govukPayId];

  const result = await query(
    `UPDATE payments SET ${setClauses}, updated_at = NOW() WHERE govuk_pay_id = $${Object.keys(updates).length + 1} RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Record payment event
 */
export async function recordPaymentEvent(data) {
  const result = await query(
    'INSERT INTO payment_events (event_id, govuk_pay_id, event_type, event_data, sequence_number, received_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
    [data.event_id, data.govuk_pay_id, data.event_type, 
     JSON.stringify(data.event_data), data.sequence_number]
  );

  return result.rows[0];
}
