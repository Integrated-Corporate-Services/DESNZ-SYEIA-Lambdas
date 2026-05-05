import { findEventById, recordIdempotentEvent } from './database/idempotencyRepository.js';
import log from './util/logger.js';

/**
 * Check idempotency BEFORE processing (race condition safe)
 * Uses ON CONFLICT to ensure only one Lambda instance processes the event
 */
export async function checkAndRecordIdempotency(eventId, govukPayId, eventType, eventData, eventTimestamp) {
  try {
    // Try to insert event - returns false if already exists
    const inserted = await recordIdempotentEvent(eventId, govukPayId, eventType, eventData, eventTimestamp);
    
    if (!inserted) {
      log.info('[idempotencyService] Duplicate event detected', { eventId, govukPayId });
      const existing = await findEventById(eventId);
      return { isDuplicate: true, event: existing };
    }

    log.debug('[idempotencyService] New event recorded', { eventId, govukPayId });
    return { isDuplicate: false };
  } catch (err) {
    log.error('[idempotencyService] Error', { eventId, err: err.message });
    throw err;
  }
}
