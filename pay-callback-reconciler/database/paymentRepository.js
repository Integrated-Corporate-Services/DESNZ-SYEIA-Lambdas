import { query } from '../util/database.js';

export async function findByGovukPayId(govukPayId) {
  const result = await query(
    'SELECT * FROM payments WHERE govuk_pay_id = $1',
    [govukPayId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new payment record
 */
export async function createPayment(govukPayId, initialData = {}) {
  const {
    reference = null,
    amount = null,
    status = 'pending',
    description = null
  } = initialData;

  const result = await query(
    'INSERT INTO payments (govuk_pay_id, reference, amount, status, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
    [govukPayId, reference, amount, status, description]
  );

  return result.rows[0];
}

/**
 * Get all payment events (for state derivation)
 * Orders by event_timestamp from webhook, then received_at as fallback
 */
export async function getPaymentEvents(govukPayId) {
  const result = await query(
    'SELECT * FROM payment_events WHERE govuk_pay_id = $1 ORDER BY event_timestamp ASC, received_at ASC',
    [govukPayId]
  );
  return result.rows || [];
}

/**
 * Update payment with out-of-order handling (SQL injection safe)
 */
export async function updatePaymentWithOrdering(govukPayId, updates) {
  // Whitelist of allowed fields to prevent SQL injection
  const allowedFields = [
    'status', 'event_history', 'event_count', 'last_event_type',
    'confirmed_at', 'captured_at', 'settled_at', 'failed_at',
    'expired_at', 'refunded_at', 'amount', 'reference'
  ];

  // Filter to only allowed fields
  const validUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      // Stringify JSONB fields
      if (key === 'event_history' && updates[key] !== null && updates[key] !== undefined) {
        validUpdates[key] = JSON.stringify(updates[key]);
      } else {
        validUpdates[key] = updates[key];
      }
    }
  });

  if (Object.keys(validUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClauses = Object.keys(validUpdates)
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const values = [...Object.values(validUpdates), govukPayId];

  const result = await query(
    `UPDATE payments SET ${setClauses}, updated_at = NOW() WHERE govuk_pay_id = $${Object.keys(validUpdates).length + 1} RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Record payment event with timestamp from webhook
 */
export async function recordPaymentEvent(data) {
  const result = await query(
    'INSERT INTO payment_events (event_id, govuk_pay_id, event_type, event_data, event_timestamp, received_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
    [data.event_id, data.govuk_pay_id, data.event_type, 
     JSON.stringify(data.event_data), data.event_timestamp]
  );

  return result.rows[0];
}
