/**
 * GOV.UK Notify Email Sender Lambda
 * 
 * Architecture Flow:
 * 1. Backend publishes email send request to SQS
 * 2. SQS triggers this Lambda via event source mapping
 * 3. Lambda validates SQS message
 * 4. Lambda calls GOV.UK Notify API to send email
 * 5. Lambda updates database with result
 * 6. Returns batch failures for retry
 * 
 * SQS Message Structure:
 * {
 *   "requestId": "req-123",
 *   "correlationId": "corr-456",
 *   "reference": "user-123-email-2024-04-21",
 *   "emailAddress": "user@example.gov.uk",
 *   "templateId": "template-uuid",
 *   "personalisation": { "name": "John" },
 *   "metadata": {...}
 * }
 */

import { sendEmailViaNotify } from './services/notifyService.js';
import { updateEmailRequestStatus, recordEmailRequest } from './database/emailRequestRepository.js';
import log from './util/logger.js';
import { emitMetric } from './util/metrics.js';

/**
 * Lambda handler triggered by SQS event source mapping
 * @param {object} event - SQS event with Records array
 * @param {object} context - Lambda context
 * @returns {object} - Batch item failures for partial retry
 */
export const handler = async (event, context) => {
  const requestId = context?.requestId || context?.awsRequestId || 'unknown';
  const startTime = Date.now();
  const batchItemFailures = [];

  try {
    // Validate SQS event
    if (!event.Records || !Array.isArray(event.Records)) {
      log.error('[handler] Invalid event - not an SQS event', {
        requestId,
        eventKeys: Object.keys(event),
      });
      throw new Error('Expected SQS event with Records array');
    }

    log.info('[handler] SQS batch received', {
      requestId,
      recordCount: event.Records.length,
      eventSource: event.Records[0]?.eventSource,
    });

    // Process each message
    for (const record of event.Records) {
      const messageId = record.messageId;
      const correlationId = record.messageAttributes?.CorrelationId?.stringValue || 'unknown';

      log.info('[handler] Processing message', {
        requestId,
        messageId,
        correlationId,
      });

      try {
        // Parse and validate message
        const emailRequest = JSON.parse(record.body);
        
        if (!isValidEmailRequest(emailRequest)) {
          log.error('[handler] Invalid message format', {
            messageId,
            correlationId,
            hasEmailAddress: !!emailRequest.emailAddress,
            hasTemplateId: !!emailRequest.templateId,
          });

          // Invalid format - don't retry, send to DLQ
          await emitMetric('NotifyInvalidRequests', 1);
          continue;
        }

        log.info('[handler] Message validated', {
          requestId,
          messageId,
          correlationId,
          reference: emailRequest.reference,
          templateId: emailRequest.templateId,
        });

        // Record email request in database (pending)
        await recordEmailRequest({
          requestId: emailRequest.requestId || messageId,
          correlationId: emailRequest.correlationId || correlationId,
          reference: emailRequest.reference,
          emailAddress: emailRequest.emailAddress,
          templateId: emailRequest.templateId,
          personalisation: emailRequest.personalisation,
          status: 'pending',
        });

        // Call GOV.UK Notify API to send email
        const notifyResult = await sendEmailViaNotify(
          emailRequest.emailAddress,
          emailRequest.templateId,
          emailRequest.personalisation,
          emailRequest.reference,
          correlationId
        );

        log.info('[handler] Email sent successfully via Notify', {
          requestId,
          messageId,
          correlationId,
          notificationId: notifyResult.notificationId,
          reference: emailRequest.reference,
        });

        // Update database with success
        await updateEmailRequestStatus(
          emailRequest.requestId || messageId,
          'sent',
          notifyResult.notificationId,
          null // no error
        );

        // Emit success metric
        await emitMetric('NotifyEmailsSent', 1, {
          templateId: emailRequest.templateId,
        });

      } catch (error) {
        log.error('[handler] Message processing failed', {
          requestId,
          messageId,
          correlationId,
          error: error.message,
          errorCode: error.code,
          isRetryable: error.isRetryable || false,
        });

        // Update database with failure
        try {
          const emailRequest = JSON.parse(record.body);
          await updateEmailRequestStatus(
            emailRequest.requestId || messageId,
            'failed',
            null,
            error.message
          );
        } catch (dbError) {
          log.error('[handler] Failed to update database', {
            messageId,
            dbError: dbError.message,
          });
        }

        // Determine if retryable
        if (error.isRetryable) {
          // Add to batch failures - SQS will retry
          batchItemFailures.push({
            itemIdentifier: messageId,
          });

          log.warn('[handler] Message marked for retry', {
            requestId,
            messageId,
            correlationId,
          });

          await emitMetric('NotifyRetries', 1);
        } else {
          // Permanent failure - let it go to DLQ
          log.error('[handler] Permanent failure - will move to DLQ', {
            requestId,
            messageId,
            correlationId,
            error: error.message,
          });

          await emitMetric('NotifyEmailsFailed', 1);
        }
      }
    }

    log.info('[handler] Batch processing complete', {
      requestId,
      totalMessages: event.Records.length,
      failedMessages: batchItemFailures.length,
      successMessages: event.Records.length - batchItemFailures.length,
      duration: Date.now() - startTime,
    });

    // Return partial batch failure response
    return {
      batchItemFailures,
    };

  } catch (error) {
    log.error('[handler] Unhandled batch error', {
      requestId,
      error: error.message,
      stack: error.stack,
    });

    // Throw error to make SQS retry entire batch
    throw error;

  } finally {
    const duration = Date.now() - startTime;
    log.info('[handler] Handler complete', {
      requestId,
      duration,
    });
  }
};

/**
 * Validate email request message structure
 * @param {object} request - Email request from SQS
 * @returns {boolean} - True if valid
 */
function isValidEmailRequest(request) {
  if (!request || typeof request !== 'object') {
    return false;
  }

  // Required fields
  if (!request.emailAddress || typeof request.emailAddress !== 'string') {
    return false;
  }

  if (!request.templateId || typeof request.templateId !== 'string') {
    return false;
  }

  // Optional but if present, must be object
  if (request.personalisation !== undefined) {
    if (typeof request.personalisation !== 'object' || Array.isArray(request.personalisation)) {
      return false;
    }
  }

  return true;
}
