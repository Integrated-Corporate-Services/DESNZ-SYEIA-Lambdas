import crypto from 'crypto';
import log from '../util/logger.js';

export function validateSignature(
  payload: string, 
  signature: string, 
  secret: string
): boolean {
  if (!signature || !secret || !payload) {
    log.warn('[signatureValidator] Missing data');
    return false;
  }
  try {
    const calculated = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(signature));
  } catch (err) {
    log.error('[signatureValidator] Error', { err });
    return false;
  }
}
