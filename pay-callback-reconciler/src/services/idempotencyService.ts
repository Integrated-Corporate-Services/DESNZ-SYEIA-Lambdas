import { findEventById, recordIdempotentEvent } from '../database/idempotencyRepository.js';
import log from '../util/logger.js';
import type { IdempotencyCheck } from '../types/index.js';

/**
 * Check idempotency BEFORE processing (race condition safe)
 * Uses ON CONFLICT to ensure only one Lambda instance processes the event
 */
export async function checkAndRecordIdempotency(
  eventId: string,
  govukPayId: string,
  eventType: string,
  eventData: any,
  eventTimestamp: string | Date
): Promise<IdempotencyCheck> {
  try {
    // Try to insert event - returns false if already exists
    const inserted = await recordIdempotentEvent(eventId, govukPayId, eventType, eventData, eventTimestamp);
    
    if (!inserted) {
      log.info('[idempotencyService] Duplicate event detected', { eventId, govukPayId });
      const existing = await findEventById(eventId);
      return { isDuplicate: true, event: existing || undefined };
    }

    log.debug('[idempotencyService] New event recorded', { eventId, govukPayId });
    return { isDuplicate: false };
  } catch (err) {
    const error = err as Error;
    log.error('[idempotencyService] Error', { eventId, err: error.message });
    throw err;
  }
}
