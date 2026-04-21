import { validateSignature } from './validators/signatureValidator.js';
import { validatePayload } from './validators/payloadValidator.js';
import { checkIdempotency } from './idempotencyService.js';
import { forwardWebhookToBackend } from './services/restClient.js';
import { triggerWithFallback } from './services/ecsTaskTrigger.js';
import { recordPaymentEvent } from './database/paymentRepository.js';
import log from './util/logger.js';

/**
 * REST Integration Webhook Handler
 * 
 * Architecture:
 * 1. Webhook arrives at Lambda
 * 2. Validates signature and payload
 * 3. Checks idempotency
 * 4. Forwards to backend via REST API
 * 5. Backend processes asynchronously (optionally via ECS)
 * 6. Non-blocking communication pattern
 * 
 * Processing modes (controlled by WEBHOOK_PROCESSING_MODE env var):
 * - 'rest': Forward directly to backend REST API
 * - 'ecs': Trigger ECS task for processing
 * - 'ecs-with-fallback': Try ECS first, fallback to REST API
 */

const PROCESSING_MODE = process.env.WEBHOOK_PROCESSING_MODE || 'rest';

export async function handler(event, context) {
  const requestId = context?.requestId || 'unknown';

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: Validate Signature
    // ═══════════════════════════════════════════════════════════
    const signature = event.headers?.['X-Gov-Uk-Pay-Signature'];
    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    
    if (!validateSignature(rawBody, signature, process.env.GOVUK_PAY_WEBHOOK_SECRET)) {
      log.warn('[webhookService:REST] Invalid signature', { requestId });
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
      log.warn('[webhookService:REST] Invalid JSON', { requestId, err });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' }),
      };
    }

    const validation = validatePayload(payload);
    if (!validation.valid) {
      log.warn('[webhookService:REST] Validation failed', { 
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

    log.info('[webhookService:REST] Processing webhook', { 
      requestId, 
      eventId,
      paymentId,
      eventType,
      mode: PROCESSING_MODE,
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 4: Check Idempotency
    // ═══════════════════════════════════════════════════════════
    const isIdempotent = await checkIdempotency(eventId, paymentId);
    if (isIdempotent.isDuplicate) {
      log.info('[webhookService:REST] Duplicate event (idempotent)', { 
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
    // STEP 5: Record Event (for audit trail)
    // ═══════════════════════════════════════════════════════════
    await recordPaymentEvent({
      event_id: eventId,
      govuk_pay_id: paymentId,
      event_type: eventType,
      event_data: payload.data,
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 6: Forward to Backend (Non-blocking)
    // ═══════════════════════════════════════════════════════════
    const metadata = { 
      requestId, 
      eventId, 
      signature, 
      rawBody 
    };

    let processingResult;

    switch (PROCESSING_MODE) {
      case 'ecs':
        // Trigger ECS task only
        try {
          const { triggerWebhookProcessingTask } = await import('./services/ecsTaskTrigger.js');
          processingResult = await triggerWebhookProcessingTask(payload, metadata);
        } catch (err) {
          log.error('[webhookService:REST] ECS trigger failed', {
            requestId,
            eventId,
            error: err.message,
          });
          // Return 202 - webhook accepted but processing failed
          return {
            statusCode: 202,
            body: JSON.stringify({ 
              received: true, 
              eventId,
              warning: 'Processing trigger failed',
            }),
          };
        }
        break;

      case 'ecs-with-fallback':
        // Try ECS, fallback to REST
        processingResult = await triggerWithFallback(
          payload, 
          metadata,
          forwardWebhookToBackend
        );
        break;

      case 'rest':
      default:
        // Forward to backend REST API
        processingResult = await forwardWebhookToBackend(payload, metadata);
        break;
    }

    log.info('[webhookService:REST] Webhook forwarded successfully', { 
      requestId, 
      eventId,
      paymentId,
      method: processingResult.method || PROCESSING_MODE,
    });

    // ═══════════════════════════════════════════════════════════
    // STEP 7: Return Success (Non-blocking acknowledgment)
    // ═══════════════════════════════════════════════════════════
    return {
      statusCode: 202,
      body: JSON.stringify({ 
        received: true, 
        eventId,
        timestamp: new Date().toISOString(),
        processingMethod: processingResult.method || PROCESSING_MODE,
      }),
    };

  } catch (err) {
    log.error('[webhookService:REST] Error processing webhook', { 
      requestId, 
      error: err.message,
      stack: err.stack,
    });
    
    // Return 202 to prevent GOV.UK Pay from retrying
    // Backend will handle processing via async mechanisms
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
 * Get processing mode information
 * Useful for health checks and debugging
 */
export function getProcessingMode() {
  return {
    mode: PROCESSING_MODE,
    description: getModeDescription(PROCESSING_MODE),
    config: {
      backendHost: process.env.BACKEND_API_HOST || 'not-configured',
      ecsCluster: process.env.ECS_CLUSTER_ARN || 'not-configured',
    },
  };
}

function getModeDescription(mode) {
  const descriptions = {
    'rest': 'Forward webhooks directly to backend REST API',
    'ecs': 'Trigger ECS tasks for webhook processing',
    'ecs-with-fallback': 'Try ECS first, fallback to REST API on failure',
  };
  return descriptions[mode] || 'Unknown processing mode';
}

export default {
  handler,
  getProcessingMode,
};
