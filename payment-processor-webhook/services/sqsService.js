import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import log from '../util/logger.js';

/**
 * SQS Service for Async Webhook Processing
 * Sends webhook events to SQS queue for backend consumption
 * Implements proper message grouping, deduplication, and error handling
 */

const sqsClient = new SQSClient({ 
  region: process.env.AWS_REGION || 'eu-west-2' 
});

const SQS_CONFIG = {
  queueUrl: process.env.WEBHOOK_SQS_QUEUE_URL || '',
  messageGroupId: process.env.SQS_MESSAGE_GROUP_ID || 'payment-webhooks',
  enableContentBasedDeduplication: process.env.SQS_CONTENT_DEDUP === 'true',
  visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300'),
  maxRetries: parseInt(process.env.SQS_MAX_RETRIES || '3'),
};

/**
 * Send webhook event to SQS queue
 * @param {object} webhookPayload - The validated webhook payload
 * @param {object} metadata - Additional metadata (requestId, eventId, etc.)
 * @returns {Promise<object>} - SQS send result
 */
export async function sendWebhookToQueue(webhookPayload, metadata) {
  const { requestId, eventId, signature, rawBody } = metadata;
  const paymentId = webhookPayload.data?.id;
  const eventType = webhookPayload.type;

  log.info('[SQSService] Sending webhook to SQS queue', {
    requestId,
    eventId,
    paymentId,
    eventType,
    queueUrl: SQS_CONFIG.queueUrl,
  });

  // Validate configuration
  if (!SQS_CONFIG.queueUrl) {
    throw new Error('SQS queue URL not configured (WEBHOOK_SQS_QUEUE_URL)');
  }

  try {
    // Prepare message body
    const messageBody = {
      webhook: webhookPayload,
      metadata: {
        requestId,
        eventId,
        signature,
        receivedAt: new Date().toISOString(),
        source: 'lambda-webhook-processor',
        paymentId,
        eventType,
      },
      // Include raw body for signature verification if needed
      rawWebhook: rawBody,
    };

    // Build message attributes for filtering and routing
    const messageAttributes = {
      EventType: {
        DataType: 'String',
        StringValue: eventType,
      },
      PaymentId: {
        DataType: 'String',
        StringValue: paymentId,
      },
      EventId: {
        DataType: 'String',
        StringValue: eventId,
      },
      Source: {
        DataType: 'String',
        StringValue: 'lambda-webhook-processor',
      },
      Timestamp: {
        DataType: 'Number',
        StringValue: Date.now().toString(),
      },
    };

    // Determine if queue is FIFO
    const isFifoQueue = SQS_CONFIG.queueUrl.endsWith('.fifo');

    // Build send message command
    const commandInput = {
      QueueUrl: SQS_CONFIG.queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: messageAttributes,
      
      // FIFO-specific parameters
      ...(isFifoQueue && {
        MessageGroupId: SQS_CONFIG.messageGroupId,
        // Use eventId as deduplication ID to prevent duplicate processing
        MessageDeduplicationId: SQS_CONFIG.enableContentBasedDeduplication 
          ? undefined 
          : eventId,
      }),
    };

    const command = new SendMessageCommand(commandInput);
    const response = await sqsClient.send(command);

    log.info('[SQSService] Webhook sent to SQS successfully', {
      requestId,
      eventId,
      paymentId,
      messageId: response.MessageId,
      sequenceNumber: response.SequenceNumber,
    });

    return {
      success: true,
      messageId: response.MessageId,
      sequenceNumber: response.SequenceNumber,
      queueUrl: SQS_CONFIG.queueUrl,
    };

  } catch (err) {
    log.error('[SQSService] Failed to send webhook to SQS', {
      requestId,
      eventId,
      paymentId,
      error: err.message,
      errorCode: err.code,
      stack: err.stack,
    });

    throw err;
  }
}

/**
 * Send multiple webhook events to SQS in batch
 * @param {Array} webhookEntries - Array of {webhookPayload, metadata}
 * @returns {Promise<object>} - Batch send result
 */
export async function sendWebhookBatchToQueue(webhookEntries) {
  log.info('[SQSService] Sending webhook batch to SQS', {
    batchSize: webhookEntries.length,
  });

  if (!SQS_CONFIG.queueUrl) {
    throw new Error('SQS queue URL not configured (WEBHOOK_SQS_QUEUE_URL)');
  }

  if (webhookEntries.length === 0) {
    return { success: true, successful: [], failed: [] };
  }

  if (webhookEntries.length > 10) {
    throw new Error('SQS batch size cannot exceed 10 messages');
  }

  try {
    const isFifoQueue = SQS_CONFIG.queueUrl.endsWith('.fifo');

    // Build batch entries
    const entries = webhookEntries.map((entry, index) => {
      const { webhookPayload, metadata } = entry;
      const { requestId, eventId, signature, rawBody } = metadata;
      const paymentId = webhookPayload.data?.id;
      const eventType = webhookPayload.type;

      const messageBody = {
        webhook: webhookPayload,
        metadata: {
          requestId,
          eventId,
          signature,
          receivedAt: new Date().toISOString(),
          source: 'lambda-webhook-processor',
          paymentId,
          eventType,
        },
        rawWebhook: rawBody,
      };

      return {
        Id: `${index}`,
        MessageBody: JSON.stringify(messageBody),
        MessageAttributes: {
          EventType: { DataType: 'String', StringValue: eventType },
          PaymentId: { DataType: 'String', StringValue: paymentId },
          EventId: { DataType: 'String', StringValue: eventId },
          Source: { DataType: 'String', StringValue: 'lambda-webhook-processor' },
        },
        ...(isFifoQueue && {
          MessageGroupId: SQS_CONFIG.messageGroupId,
          MessageDeduplicationId: SQS_CONFIG.enableContentBasedDeduplication 
            ? undefined 
            : eventId,
        }),
      };
    });

    const command = new SendMessageBatchCommand({
      QueueUrl: SQS_CONFIG.queueUrl,
      Entries: entries,
    });

    const response = await sqsClient.send(command);

    log.info('[SQSService] Webhook batch sent to SQS', {
      successful: response.Successful?.length || 0,
      failed: response.Failed?.length || 0,
    });

    return {
      success: (response.Failed?.length || 0) === 0,
      successful: response.Successful || [],
      failed: response.Failed || [],
    };

  } catch (err) {
    log.error('[SQSService] Failed to send webhook batch to SQS', {
      error: err.message,
      errorCode: err.code,
    });

    throw err;
  }
}

/**
 * Send webhook with retry logic
 * @param {object} webhookPayload - The validated webhook payload
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} - Send result
 */
export async function sendWebhookWithRetry(webhookPayload, metadata) {
  const { requestId, eventId } = metadata;
  let lastError;

  for (let attempt = 1; attempt <= SQS_CONFIG.maxRetries; attempt++) {
    try {
      log.debug('[SQSService] Attempting to send webhook', {
        attempt,
        maxRetries: SQS_CONFIG.maxRetries,
        requestId,
        eventId,
      });

      const result = await sendWebhookToQueue(webhookPayload, metadata);
      return result;

    } catch (err) {
      lastError = err;

      // Don't retry on certain errors
      if (isNonRetryableError(err)) {
        log.warn('[SQSService] Non-retryable error encountered', {
          requestId,
          eventId,
          error: err.message,
          errorCode: err.code,
        });
        throw err;
      }

      // Retry with exponential backoff (except on last attempt)
      if (attempt < SQS_CONFIG.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        log.warn('[SQSService] Send failed, retrying', {
          attempt,
          delay,
          error: err.message,
          requestId,
          eventId,
        });
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  log.error('[SQSService] All retry attempts exhausted', {
    requestId,
    eventId,
    error: lastError?.message,
  });

  throw lastError || new Error('Failed to send webhook to SQS after retries');
}

/**
 * Check if error is non-retryable
 * @param {Error} error - Error object
 * @returns {boolean} - True if non-retryable
 */
function isNonRetryableError(error) {
  const nonRetryableCodes = [
    'InvalidParameterValue',
    'InvalidMessageContents',
    'MissingParameter',
    'QueueDoesNotExist',
    'AccessDenied',
    'InvalidSecurity',
  ];

  return nonRetryableCodes.includes(error.code || error.name);
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get SQS configuration information
 * Useful for health checks and debugging
 */
export function getSQSConfig() {
  return {
    queueUrl: SQS_CONFIG.queueUrl || 'not-configured',
    messageGroupId: SQS_CONFIG.messageGroupId,
    contentBasedDeduplication: SQS_CONFIG.enableContentBasedDeduplication,
    isFifoQueue: SQS_CONFIG.queueUrl.endsWith('.fifo'),
    maxRetries: SQS_CONFIG.maxRetries,
  };
}

export default {
  sendWebhookToQueue,
  sendWebhookBatchToQueue,
  sendWebhookWithRetry,
  getSQSConfig,
};
