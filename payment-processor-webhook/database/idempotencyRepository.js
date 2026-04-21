import { query } from '../util/database.js';
export async function findEventById(eventId) {
  const result = await query('SELECT * FROM payment_events WHERE event_id = $1', [eventId]);
  return result.rows[0] || null;
}
export async function recordIdempotentEvent(eventId, govukPayId) {
  return await query('INSERT INTO payment_events (event_id, govuk_pay_id, processed) VALUES ($1, $2, false)', [eventId, govukPayId]);
}
