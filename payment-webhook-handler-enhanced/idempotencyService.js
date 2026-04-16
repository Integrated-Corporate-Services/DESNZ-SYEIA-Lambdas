import { findEventById, recordIdempotentEvent } from './database/idempotencyRepository.js';
import log from './util/logger.js';
export async function checkIdempotency(eventId, govukPayId) {
  try {
    const existing = await findEventById(eventId);
    if (existing) {
      log.info('[idempotencyService] Idempotent request detected', { eventId });
      return { isDuplicate: true, event: existing };
    }
    await recordIdempotentEvent(eventId, govukPayId);
    return { isDuplicate: false };
  } catch (err) {
    log.error('[idempotencyService] Error', { eventId, err });
    throw err;
  }
}
