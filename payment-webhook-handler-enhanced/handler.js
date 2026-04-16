import { handler as webhookHandler } from './webhookService.js';
import log from './util/logger.js';

/**
 * Enhanced Lambda handler supporting all 6 GOV.UK Pay event types
 * with out-of-order event resilience
 */
export const handler = async (event, context) => {
  const requestId = context?.requestId || 'unknown';
  const startTime = Date.now();

  try {
    log.info('[handler] Webhook received', { requestId, path: event.path });
    
    return await webhookHandler(event, context);
    
  } catch (err) {
    log.error('[handler] Unhandled error', { requestId, err });
    
    return {
      statusCode: 202,
      body: JSON.stringify({ accepted: true, warn: 'Processing error' }),
    };
  } finally {
    const duration = Date.now() - startTime;
    log.info('[handler] Complete', { requestId, duration });
  }
};
