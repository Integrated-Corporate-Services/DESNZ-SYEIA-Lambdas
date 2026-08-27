import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { safeJsonParse } from "../util/helpers.js";
import { PermanentError, TransientError } from "../util/error.js";
import log from "../util/logger.js";

let sqsClient = null;

/**
 * Gets or creates SQS client instance
 * @returns {SQSClient}
 */
function getSQSClient() {
  if (!sqsClient) {
    const region = process.env.REGION || process.env.AWS_REGION || "eu-west-2";
    const endpoint = process.env.AWS_ENDPOINT_URL;
    sqsClient = new SQSClient({
      region,
      ...(endpoint ? { endpoint } : {}),
    });
  }
  return sqsClient;
}

/**
 * Gets the SQS queue URL from environment
 * @returns {string}
 */
function getQueueUrl() {
  const queueUrl = process.env.SQS_QUEUE_URL || process.env.SALESFORCE_EVENTS_QUEUE_URL;
  if (!queueUrl) {
    throw new PermanentError(
      "SQS queue URL not configured (SQS_QUEUE_URL or SALESFORCE_EVENTS_QUEUE_URL)"
    );
  }
  return queueUrl;
}

/**
 * Publishes a job to SQS queue for downstream Salesforce processing
 * @param {object} job - The outbox job object
 * @returns {Promise<string>} The SQS message ID
 */
export async function publishToSQS(job) {
  const env = process.env;
  const snapshot = safeJsonParse(job.payload_snapshot_json);
  
  if (!snapshot) {
    throw new PermanentError("Invalid snapshot JSON");
  }

  const messageBody = {
    outboxId: job.outbox_id,
    applicationId: job.application_id,
    eventType: job.event_type || "APPLICATION_SUBMITTED",
    payload: snapshot,
    metadata: {
      attemptCount: job.attempt_count || 0,
      createdAt: job.created_at,
      source: "rds-to-salesforce-relay",
      timestamp: new Date().toISOString(),
    },
  };

  const queueUrl = getQueueUrl();
  
  log.info("[publishToSQS.js : publishToSQS] Publishing to SQS", {
    outboxId: job.outbox_id,
    applicationId: job.application_id,
    queueUrl,
  });

  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageDeduplicationId: String(job.outbox_id), // For FIFO queue support
      MessageGroupId: String(job.application_id), // For FIFO queue ordering
      MessageAttributes: {
        OutboxId: {
          DataType: "String",
          StringValue: String(job.outbox_id),
        },
        ApplicationId: {
          DataType: "String",
          StringValue: String(job.application_id),
        },
        EventType: {
          DataType: "String",
          StringValue: job.event_type || "APPLICATION_SUBMITTED",
        },
      },
    });

    const response = await getSQSClient().send(command);
    
    // OBSERVABILITY: Log SQS publish success with metrics
    log.info("[publishToSQS.js : publishToSQS] Successfully published to SQS", {
      outboxId: job.outbox_id,
      applicationId: job.application_id,
      messageId: response.MessageId,
      queueUrl,
      metric: 'SQS_MESSAGE_SENT',
      metricValue: 1,
    });

    return response.MessageId;
  } catch (error) {
    // OBSERVABILITY: Log SQS publish failure with error classification
    const isTransient = 
      error.name === "ServiceUnavailable" ||
      error.name === "ThrottlingException" ||
      error.name === "RequestTimeout" ||
      error.$metadata?.httpStatusCode >= 500;
    
    log.error("[publishToSQS.js : publishToSQS] SQS publish error", {
      outboxId: job.outbox_id,
      applicationId: job.application_id,
      error: error.message,
      errorName: error.name,
      errorType: isTransient ? 'TransientError' : 'PermanentError',
      httpStatus: error.$metadata?.httpStatusCode,
      stack: error.stack,
      metric: isTransient ? 'SQS_TRANSIENT_ERROR' : 'SQS_PERMANENT_ERROR',
      metricValue: 1,
    });

    // Determine if error is retryable
    if (isTransient) {
      throw new TransientError(`SQS transient error: ${error.message}`);
    }

    throw new PermanentError(`SQS permanent error: ${error.message}`);
  }
}
