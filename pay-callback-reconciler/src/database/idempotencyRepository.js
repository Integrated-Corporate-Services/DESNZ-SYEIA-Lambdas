import { query } from '../util/database.js';

export async function findEventById(eventId) {
  const result = await query('SELECT * FROM payment_events WHERE event_id = $1', [eventId]);
  return result.rows[0] || null;
}

/**
 * Record idempotent event with ON CONFLICT to prevent duplicates
 * Returns true if event was newly inserted, false if already existed
 */
export async function recordIdempotentEvent(eventId, govukPayId, eventType, eventData, eventTimestamp) {
  try {
    const result = await query(
      `INSERT INTO payment_events (event_id, govuk_pay_id, event_type, event_data, event_timestamp, processed, received_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       ON CONFLICT(event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, govukPayId, eventType, JSON.stringify(eventData), eventTimestamp]
    );
    // If no row returned, event already exists
    return result.rows.length > 0;
  } catch (err) {
    throw err;
  }
}
