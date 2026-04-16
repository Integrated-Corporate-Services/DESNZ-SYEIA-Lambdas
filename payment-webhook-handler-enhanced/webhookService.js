import { validateSignature } from './validators/signatureValidator.js';
import { validatePayload } from './validators/payloadValidator.js';
import { checkIdempotency } from './idempotencyService.js';
import { processPayment } from './paymentProcessor.js';
import { recordPaymentEvent } from './database/paymentRepository.js';
import log from './util/logger.js';

/**
 * Webhook handler supporting all 6 GOV.UK Pay event types:
 * - payment.confirmed
 * - payment.captured
 * - payment.settled
 * - payment.failed
 * - payment.expired
 * - payment.refunded
 */
export async function handler(event, context) {
  const requestId = context?.requestId || 'unknown';

  try {
    // Validate signature
    const signature = event.headers?.['X-Gov-Uk-Pay-Signature'];
    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    
    if (!validateSignature(rawBody, signature, process.env.GOVUK_PAY_WEBHOOK_SECRET)) {
      log.warn('[webhookService] Invalid signature', { requestId });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    // Parse and validate payload
    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      log.warn('[webhookService] Invalid JSON', { requestId, err });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      };
    }

    const validation = validatePayload(payload);
    if (!validation.valid) {
      log.warn('[webhookService] Validation failed', { requestId, errors: validation.errors });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Validation failed', details: validation.errors }),
      };
    }

    // Extract event ID
    const eventId = payload.event_id || `${payload.data.id}-${Date.now()}`;

    // Check idempotency
    const isIdempotent = await checkIdempotency(eventId, payload.data.id);
    if (isIdempotent.isDuplicate) {
      log.info('[webhookService] Duplicate event (idempotent)', { requestId, eventId });
      return {
        statusCode: 200,
        body: JSON.stringify({ received: true, isDuplicate: true }),
      };
    }

    // Process payment (with out-of-order handling)
    await processPayment(payload, { requestId, eventId, signature, rawBody });

    // Record event
    await recordPaymentEvent({
      event_id: eventId,
      govuk_pay_id: payload.data.id,
      event_type: payload.type,
      event_data: payload.data,
    });

    log.info('[webhookService] Processing complete', { requestId, eventId });

    return {
      statusCode: 202,
      body: JSON.stringify({ 
        received: true, 
        eventId,
        timestamp: new Date().toISOString(),
      }),
    };

  } catch (err) {
    log.error('[webhookService] Error', { requestId, err });
    
    return {
      statusCode: 202,
      body: JSON.stringify({ received: true }),
    };
  }
}
