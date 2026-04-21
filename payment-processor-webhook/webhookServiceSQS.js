import { validateSignature } from './validators/signatureValidator.js';
import { validatePayload } from './validators/payloadValidator.js';
import { checkIdempotency } from './idempotencyService.js';
import { sendWebhookWithRetry } from './services/sqsService.js';
import { recordPaymentEvent } from './database/paymentRepository.js';
import log from './util/logger.js';

/**
 * SQS-Based Webhook Handler
 * 
 * Architecture Flow:
 * ┌─────────────────┐
 * │  GOV.UK Pay     │
 * │  Webhook        │
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │  Lambda         │
 * │  1. Validate    │
 * │  2. Dedupe      │
 * │  3. Send to SQS │
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │  SQS Queue      │
 * │  (FIFO/Standard)│
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │  Backend/ECS    │
 * │  Async Process  │
 * │  Payment State  │
 * └─────────────────┘
 * 
 * Benefits:
 * - Non-blocking: Lambda responds immediately
 * - Scalable: SQS handles traffic spikes
 * - Reliable: Built-in retry and DLQ support
 * - Decoupled: Backend processes independently
 */

export async function handler(event, context) {
  const requestId = context?.requestId || 'unknown';

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: Validate Signature
    // ═══════════════════════════════════════════════════════════
    const signature = event.headers?.['X-Gov-Uk-Pay-Signature'];
    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    
    if (!validateSignature(rawBody, signature, process.env.GOVUK_PAY_WEBHOOK_SECRET)) {
      log.warn('[webhookService:SQS] Invalid signature', { requestId });
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Parse and Validate Payload
    // ═══════════════════════════════════════════════════════════
    let payload;
    try {
      payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      log.warn('[webhookService:SQS] Invalid JSON', { requestId, err });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      };
    }

    const validation = validatePayload(payload);
    if (!validation.valid) {
      log.warn('[webhookService:SQS] Validation failed', { 
        requestId, 
        errors: validation.errors 
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Validation failed', 
          details: validation.errors 
        }),
      };
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Extract Event Metadata
    // ═══════════════════════════════════════════════════════════
    const eventId = payload.event_id || `${payload.data.id}-${Date.now()}`;
    const paymentId = payload.data.id;
    const eventType = payload.type;

    log.info('[webhookService:SQS] Processing webhook', { 
      requestId, 
      eventId,
      paymentId,
      eventType,
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 4: Check Idempotency (Lambda-level deduplication)
    // ═══════════════════════════════════════════════════════════
    const isIdempotent = await checkIdempotency(eventId, paymentId);
    if (isIdempotent.isDuplicate) {
      log.info('[webhookService:SQS] Duplicate event (idempotent)', { 
        requestId, 
        eventId,
        paymentId,
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          received: true, 
          isDuplicate: true,
          eventId,
        }),
      };
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 5: Record Event (Audit Trail)
    // ═══════════════════════════════════════════════════════════
    try {
      await recordPaymentEvent({
        event_id: eventId,
        govuk_pay_id: paymentId,
        event_type: eventType,
        event_data: payload.data,
      });
    } catch (err) {
      // Log but don't fail - SQS send is more critical
      log.warn('[webhookService:SQS] Failed to record event (non-critical)', {
        requestId,
        eventId,
        error: err.message,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 6: Send to SQS Queue (Main Processing)
    // ═══════════════════════════════════════════════════════════
    const metadata = { 
      requestId, 
      eventId, 
      signature, 
      rawBody 
    };

    try {
      const sqsResult = await sendWebhookWithRetry(payload, metadata);

      log.info('[webhookService:SQS] Webhook sent to SQS successfully', { 
        requestId, 
        eventId,
        paymentId,
        messageId: sqsResult.messageId,
        sequenceNumber: sqsResult.sequenceNumber,
      });

      // ═══════════════════════════════════════════════════════════
      // STEP 7: Return Success (Non-blocking acknowledgment)
      // ═══════════════════════════════════════════════════════════
      return {
        statusCode: 202,
        body: JSON.stringify({ 
          received: true, 
          eventId,
          messageId: sqsResult.messageId,
          timestamp: new Date().toISOString(),
          processingMethod: 'sqs',
        }),
      };

    } catch (sqsError) {
      // SQS send failed - log and return accepted (to prevent GOV.UK Pay retry storm)
      log.error('[webhookService:SQS] Failed to send to SQS', {
        requestId,
        eventId,
        paymentId,
        error: sqsError.message,
        errorCode: sqsError.code,
      });

      // Return 202 to acknowledge receipt (manual intervention may be needed)
      return {
        statusCode: 202,
        body: JSON.stringify({ 
          received: true, 
          eventId,
          warning: 'Queuing failed - manual intervention required',
        }),
      };
    }

  } catch (err) {
    log.error('[webhookService:SQS] Unexpected error', { 
      requestId, 
      error: err.message,
      stack: err.stack,
    });
    
    // Return 202 to prevent GOV.UK Pay from retrying
    // Dead Letter Queue will capture failed messages
    return {
      statusCode: 202,
      body: JSON.stringify({ 
        received: true,
        warning: 'Processing error but webhook accepted',
      }),
    };
  }
}

/**
 * Health check / info endpoint
 * Returns configuration and status information
 */
export function getProcessingInfo() {
  const { getSQSConfig } = require('./services/sqsService.js');
  
  return {
    processingMethod: 'sqs',
    description: 'Webhook events are sent to SQS queue for async processing',
    sqsConfig: getSQSConfig(),
    supportedEvents: [
      'payment.confirmed',
      'payment.captured',
      'payment.settled',
      'payment.failed',
      'payment.expired',
      'payment.refunded',
    ],
  };
}

export default {
  handler,
  getProcessingInfo,
};
