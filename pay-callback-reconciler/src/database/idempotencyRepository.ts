import { QueryResult } from 'pg';
import { query } from '../util/database.js';
import { idempotencyQueries } from '../queries/index.js';
import type { PaymentEvent } from '../types/index.js';

export async function findEventById(eventId: string): Promise<PaymentEvent | null> {
  const result: QueryResult<PaymentEvent> = await query(
    idempotencyQueries.findEventById,
    [eventId]
  );
  return result.rows[0] || null;
}

/**
 * Record idempotent event with ON CONFLICT to prevent duplicates
 * Returns true if event was newly inserted, false if already existed
 */
export async function recordIdempotentEvent(
  eventId: string,
  govukPayId: string,
  eventType: string,
  eventData: any,
  eventTimestamp: string | Date
): Promise<boolean> {
  try {
    const result: QueryResult<{ event_id: string }> = await query(
      idempotencyQueries.recordIdempotentEvent,
      [eventId, govukPayId, eventType, JSON.stringify(eventData), eventTimestamp]
    );
    // If no row returned, event already exists
    return result.rows.length > 0;
  } catch (err) {
    throw err;
  }
}
