import { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';
import { processSQSBatch } from './src/services/paymentProcessor.js';
import { validateEnvVars } from './src/util/validation.js';
import { ensurePoolInitialized } from './src/util/database.js';
import log from './src/util/logger.js';

// Validate environment variables at cold start (outside handler)
let envValidated = false;

function ensureEnvValidation(): void {
  if (!envValidated) {
    validateEnvVars();
    envValidated = true;
  }
}

/**
 * Lambda handler triggered by SQS event source mapping
 * 
 * Architecture Flow:
 * 1. Backend receives webhook from GOV.UK Pay (HTTP)
 * 2. Backend validates and sends to SQS
 * 3. SQS triggers this Lambda via event source mapping
 * 4. Lambda processes payment webhook asynchronously
 * 5. Updates payment status and creates outbox events
 * 
 * SQS Event Structure:
 * {
 *   "Records": [
 *     {
 *       "messageId": "...",
 *       "body": "{\"webhook\": {...}, \"metadata\": {...}}",
 *       "attributes": {...},
 *       "messageAttributes": {...}
 *     }
 *   ]
 * }
 */
export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  const requestId = context?.awsRequestId || 'unknown';
  const startTime = Date.now();

  try {
    // Validate environment on first invocation or after container restart
    ensureEnvValidation();
    await ensurePoolInitialized();

    // Check if this is an SQS event
    if (!event.Records || !Array.isArray(event.Records)) {
      log.error('[handler] Invalid event - not an SQS event', { 
        requestId, 
        eventKeys: Object.keys(event) 
      });
      throw new Error('Expected SQS event with Records array');
    }

    log.info('[handler] SQS event received', { 
      requestId, 
      recordCount: event.Records.length,
      eventSource: event.Records[0]?.eventSource,
    });

    // Process SQS batch
    const result = await processSQSBatch(event.Records, context);
    
    log.info('[handler] Processing complete', {
      requestId,
      duration: Date.now() - startTime,
      failedCount: result.batchItemFailures?.length || 0,
    });

    // Return partial batch failure response
    // SQS will retry only the failed messages
    return result;
    
  } catch (err) {
    const error = err as Error;
    log.error('[handler] Unhandled error', { 
      requestId, 
      error: error.message,
      stack: error.stack,
    });
    
    // Throw error to make SQS retry all messages in batch
    throw err;
    
  } finally {
    const duration = Date.now() - startTime;
    log.info('[handler] Complete', { requestId, duration });
  }
};
