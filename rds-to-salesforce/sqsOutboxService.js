import { publishToSQS } from "./deliver/publishToSQS.js";
import { markJobPublishedToSQS } from "./sqsOutboxRepo.js";
import { PermanentError } from "./util/error.js";
import { safeJsonParse } from "./util/helpers.js";
import log from "./util/logger.js";

/**
 * SQS-specific service for handling outbox jobs via queue.
 * This is completely separate from the DIRECT mode to avoid breaking existing functionality.
 */

/**
 * Process a job for SQS mode - publishes to queue and marks as PUBLISHED.
 * @param {object} job - The outbox job object
 * @param {string} correlationId - Request correlation ID for tracing
 * @throws {TransientError} For retryable errors (network, throttling)
 * @throws {PermanentError} For non-retryable errors (invalid payload, config)
 */
export async function processSQSJob(job, correlationId = null) {
  const startTime = Date.now();
  const jobId = job.outbox_id;
  
  log.info(`[sqsOutboxService.js:processSQSJob] Starting SQS job processing`, {
    jobId,
    applicationId: job.application_id,
    attemptCount: job.attempt_count,
    correlationId,
  });

  // Validate payload
  const payload = extractAndValidatePayload(job);
  if (!payload) {
    log.error(`[sqsOutboxService.js:processSQSJob] Invalid payload`, { jobId, correlationId });
    throw new PermanentError('Invalid or empty payload');
  }

  // Check idempotency - if already published, skip
  if (job.sqs_message_id && job.status === 'PUBLISHED') {
    log.warn(`[sqsOutboxService.js:processSQSJob] Job already published, skipping`, {
      jobId,
      sqsMessageId: job.sqs_message_id,
      status: job.status,
      correlationId,
    });
    return { skipped: true, reason: 'already_published' };
  }

  try {
    // Publish to SQS queue
    log.info(`[sqsOutboxService.js:processSQSJob] Publishing to SQS`, {
      jobId,
      applicationId: job.application_id,
      correlationId,
    });
    
    const sqsMessageId = await publishToSQS(job);
    
    log.info(`[sqsOutboxService.js:processSQSJob] SQS publish successful`, {
      jobId,
      sqsMessageId,
      correlationId,
    });

    // Mark as published in database
    await markJobPublishedToSQS({
      jobId: job.outbox_id,
      sqsMessageId,
    });

    const duration = Date.now() - startTime;
    
    // OBSERVABILITY: Log success metrics for CloudWatch
    log.info(`[sqsOutboxService.js:processSQSJob] Job processing complete`, {
      jobId: job.outbox_id,
      sqsMessageId,
      durationMs: duration,
      correlationId,
      metric: 'SQS_PUBLISH_SUCCESS',
      metricValue: 1,
    });

    return { 
      success: true, 
      sqsMessageId, 
      durationMs: duration 
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // OBSERVABILITY: Log failure metrics for CloudWatch
    log.error(`[sqsOutboxService.js:processSQSJob] Job processing failed`, {
      jobId,
      durationMs: duration,
      error: error.message,
      errorType: error.constructor.name,
      stack: error.stack,
      correlationId,
      metric: 'SQS_PUBLISH_FAILURE',
      metricValue: 1,
    });
    throw error;
  }
}

/**
 * Extract and validate payload from job.
 * @param {object} job - The outbox job
 * @returns {object|null} Parsed payload or null if invalid
 */
function extractAndValidatePayload(job) {
  const jobId = job.outbox_id;
  
  log.debug(`[sqsOutboxService.js:extractAndValidatePayload] Extracting payload`, { jobId });
  
  let payload = null;
  
  if (typeof job.payload_snapshot_json === 'string') {
    log.debug(`[sqsOutboxService.js:extractAndValidatePayload] Parsing payload from string`, { jobId });
    payload = safeJsonParse(job.payload_snapshot_json);
  } else if (typeof job.payload_snapshot_json === 'object' && job.payload_snapshot_json !== null) {
    log.debug(`[sqsOutboxService.js:extractAndValidatePayload] Using payload as object`, { jobId });
    payload = job.payload_snapshot_json;
  } else {
    log.warn(`[sqsOutboxService.js:extractAndValidatePayload] Payload is null or invalid type`, { jobId });
  }
  
  return payload;
}

/**
 * Validate SQS configuration before processing.
 * @throws {Error} If SQS configuration is missing
 */
export function validateSQSConfiguration() {
  const queueUrl = process.env.SQS_QUEUE_URL || process.env.SALESFORCE_EVENTS_QUEUE_URL;
  
  if (!queueUrl) {
    log.error('[sqsOutboxService.js:validateSQSConfiguration] SQS queue URL not configured');
    throw new Error('SQS_QUEUE_URL or SALESFORCE_EVENTS_QUEUE_URL is required when INTEGRATION_MODE=SQS');
  }
  
  log.info('[sqsOutboxService.js:validateSQSConfiguration] SQS configuration validated', {
    queueUrl: queueUrl.substring(0, 50) + '...',
  });
  
  return queueUrl;
}
