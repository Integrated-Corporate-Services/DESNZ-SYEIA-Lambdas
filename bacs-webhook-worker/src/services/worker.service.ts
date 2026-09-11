import type { SQSRecord } from 'aws-lambda';
import { createLogger, getCorrelationId, setCorrelationId } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import type { WorkerSummary, BacsWebhookRelayEnvelope, UkSbsWebhookPayload, ProcessablePayment } from '../types';
import { ValidationError } from '../errors/worker.errors';
import { paymentRepository } from '../repositories/payment.repository';
import { applicationOutboxRepository } from '../repositories/applicationOutbox.repository';

const log = createLogger('worker.service.ts');

const METHOD = {
  PROCESS_RECORDS: 'processRecords',
  PROCESS_RECORD: 'processRecord',
  PARSE_PAYLOAD: 'parsePayload',
  VALIDATE_AND_TRANSFORM: 'validateAndTransform',
  PROCESS_PAYMENT: 'processPayment',
} as const;

export const workerService = {
  processRecords: async (records: SQSRecord[]): Promise<WorkerSummary> => {
    log.start(METHOD.PROCESS_RECORDS, { count: records.length });

    let processed = 0;
    let failed = 0;
    const errors: Array<{ message: string; recordId: string }> = [];

    for (const record of records) {
      const outcome = await processRecord(record);
      if (outcome.success) {
        processed++;
      } else {
        failed++;
        errors.push({ message: outcome.message ?? 'Unknown error', recordId: record.messageId || '' });
      }
    }

    const summary: WorkerSummary = { processed, failed, errors };
    log.info(METHOD.PROCESS_RECORDS, LOG_MESSAGES.BATCH_COMPLETE, summary);
    log.end(METHOD.PROCESS_RECORDS, summary);
    return summary;
  },
};

async function processRecord(record: SQSRecord): Promise<{ success: boolean; message?: string }> {
  log.start(METHOD.PROCESS_RECORD, { recordId: record.messageId });

  // Preserve the Lambda's correlation_id to restore after processing this message
  const lambdaCorrelationId = getCorrelationId();

  try {
    // Parse envelope from relay
    const envelope = parsePayload(record.body, record.messageId);

    // Use the envelope's correlation_id (set by relay lambda) for cross-service traceability
    if (envelope.correlationId) {
      setCorrelationId(envelope.correlationId);
      log.info(METHOD.PROCESS_RECORD, LOG_MESSAGES.RECORD_CORRELATION_ID_ADOPTED, {
        recordId: record.messageId,
        webhookId: envelope.webhookId,
        envelopeCorrelationId: envelope.correlationId,
      });
    }

    // Validate and transform to internal format
    const payment = validateAndTransform(envelope, record.messageId);

    // Process the payment
    await processPayment(payment, record.messageId);

    log.info(METHOD.PROCESS_RECORD, LOG_MESSAGES.RECORD_PROCESSED, {
      recordId: record.messageId,
      webhookId: payment.webhookId,
      transactionId: payment.transactionId,
    });
    log.end(METHOD.PROCESS_RECORD, { recordId: record.messageId, outcome: 'processed' });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(METHOD.PROCESS_RECORD, LOG_MESSAGES.RECORD_FAILED, {
      recordId: record.messageId,
      error: message,
    });
    log.end(METHOD.PROCESS_RECORD, { recordId: record.messageId, outcome: 'failed' });
    return { success: false, message };
  } finally {
    // Restore the Lambda's invocation-level correlation_id
    setCorrelationId(lambdaCorrelationId);
  }
}

function parsePayload(body: string | null, recordId: string): BacsWebhookRelayEnvelope {
  log.start(METHOD.PARSE_PAYLOAD, { recordId });

  if (!body) {
    log.error(METHOD.PARSE_PAYLOAD, LOG_MESSAGES.ENVELOPE_PARSE_FAILED, { recordId, reason: 'empty body' });
    throw new ValidationError('Empty message body');
  }

  try {
    const envelope: unknown = JSON.parse(body);

    if (typeof envelope !== 'object' || envelope === null) {
      throw new ValidationError('Invalid message envelope');
    }

    const env = envelope as Record<string, unknown>;

    // Validate envelope structure - all required fields
    if (env.schemaVersion !== '1') {
      throw new ValidationError('Invalid or missing schemaVersion');
    }

    if (env.source !== 'BACS') {
      throw new ValidationError('Invalid or missing source');
    }

    if (typeof env.webhookId !== 'string' || !env.webhookId) {
      throw new ValidationError('Missing or invalid webhookId');
    }

    if (typeof env.paymentId !== 'string' || !env.paymentId) {
      throw new ValidationError('Missing or invalid paymentId');
    }

    if (typeof env.eventType !== 'string' || !env.eventType) {
      throw new ValidationError('Missing or invalid eventType');
    }

    if (typeof env.status !== 'string' || !env.status) {
      throw new ValidationError('Missing or invalid status');
    }

    if (
      env.correlationId === undefined ||
      (env.correlationId !== null && typeof env.correlationId !== 'string')
    ) {
      throw new ValidationError('Missing or invalid correlationId');
    }

    if (typeof env.receivedAt !== 'string' || !env.receivedAt) {
      throw new ValidationError('Missing or invalid receivedAt');
    }

    if (typeof env.payload !== 'object' || env.payload === null || Array.isArray(env.payload)) {
      throw new ValidationError('Missing or invalid payload');
    }

    // Safe cast after validation
    const parsed = env as unknown as BacsWebhookRelayEnvelope;
    log.info(METHOD.PARSE_PAYLOAD, LOG_MESSAGES.ENVELOPE_PARSED, {
      recordId,
      webhookId: parsed.webhookId,
      paymentId: parsed.paymentId,
      eventType: parsed.eventType,
      source: parsed.source,
      schemaVersion: parsed.schemaVersion,
    });
    log.end(METHOD.PARSE_PAYLOAD, { recordId, webhookId: parsed.webhookId });
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) {
      log.error(METHOD.PARSE_PAYLOAD, LOG_MESSAGES.ENVELOPE_PARSE_FAILED, {
        recordId,
        error: error.message,
      });
      throw error;
    }
    log.error(METHOD.PARSE_PAYLOAD, LOG_MESSAGES.ENVELOPE_PARSE_FAILED, {
      recordId,
      error: 'Invalid JSON in message body',
    });
    throw new ValidationError('Invalid JSON in message body');
  }
}

function validateAndTransform(envelope: BacsWebhookRelayEnvelope, recordId: string): ProcessablePayment {
  log.start(METHOD.VALIDATE_AND_TRANSFORM, { recordId, webhookId: envelope.webhookId });

  const { payload } = envelope;

  // Validate envelope metadata
  const requiredEnvFields = ['webhookId', 'paymentId', 'eventType', 'receivedAt'];
  const missingEnv = requiredEnvFields.filter((key) => !envelope[key as keyof BacsWebhookRelayEnvelope]);

  if (missingEnv.length > 0) {
    log.error(METHOD.VALIDATE_AND_TRANSFORM, LOG_MESSAGES.MISSING_FIELD, {
      recordId,
      missingFields: missingEnv,
    });
    throw new ValidationError(`Missing envelope fields: ${missingEnv.join(', ')}`);
  }

  // Cast to UKSBS payload structure
  const uksbsPayload = payload as unknown as UkSbsWebhookPayload;

  // Validate UKSBS payment reference
  if (!uksbsPayload.payment?.paymentReference) {
    log.error(METHOD.VALIDATE_AND_TRANSFORM, LOG_MESSAGES.INVALID_PAYLOAD, {
      recordId,
      reason: 'missing payment.paymentReference',
    });
    throw new ValidationError('Missing payment.paymentReference in UKSBS webhook');
  }

  // Validate UKSBS amount
  if (uksbsPayload.detail?.amount == null || typeof uksbsPayload.detail.amount !== 'number' || Number.isNaN(uksbsPayload.detail.amount)) {
    log.error(METHOD.VALIDATE_AND_TRANSFORM, LOG_MESSAGES.INVALID_PAYLOAD, {
      recordId,
      reason: 'missing or invalid detail.amount',
    });
    throw new ValidationError('Missing or invalid detail.amount in UKSBS webhook');
  }

  // Validate UKSBS status
  if (!uksbsPayload.detail?.status) {
    log.error(METHOD.VALIDATE_AND_TRANSFORM, LOG_MESSAGES.INVALID_PAYLOAD, {
      recordId,
      reason: 'missing detail.status',
    });
    throw new ValidationError('Missing detail.status in UKSBS webhook');
  }

  const payment: ProcessablePayment = {
    webhookId: envelope.webhookId,
    paymentId: envelope.paymentId,
    transactionId: uksbsPayload.payment.paymentReference,
    amount: uksbsPayload.detail.amount,
    status: uksbsPayload.detail.status.toUpperCase(),
    currency: uksbsPayload.detail.currency || 'GBP',
    bacsReference: uksbsPayload.detail.bacsReference,
    eventType: envelope.eventType,
    correlationId: envelope.correlationId,
    receivedAt: envelope.receivedAt,
  };

  log.info(METHOD.VALIDATE_AND_TRANSFORM, LOG_MESSAGES.PAYLOAD_TRANSFORMED, {
    recordId,
    webhookId: payment.webhookId,
    transactionId: payment.transactionId,
    amount: payment.amount,
    status: payment.status,
  });
  log.end(METHOD.VALIDATE_AND_TRANSFORM, { recordId, webhookId: payment.webhookId });
  return payment;
}

async function processPayment(payment: ProcessablePayment, recordId: string): Promise<void> {
  log.start(METHOD.PROCESS_PAYMENT, {
    recordId,
    webhookId: payment.webhookId,
    paymentId: payment.paymentId,
    transactionId: payment.transactionId,
  });
  log.info(METHOD.PROCESS_PAYMENT, LOG_MESSAGES.PAYMENT_PROCESSING_START, {
    recordId,
    transactionId: payment.transactionId,
    amount: payment.amount,
    status: payment.status,
  });

  await paymentRepository.recordPayment(payment.transactionId, payment.amount, payment.status);

  await paymentRepository.markWebhookProcessed(payment.webhookId, 'bacs-webhook-worker');

  // Best-effort: publish a BACS_PAYMENT_EVENT to the shared application_outbox table now that
  // the payment has been recorded and the webhook marked processed. A failure here must not
  // fail/retry the whole SQS record, since the primary DB writes above already succeeded.
  try {
    await applicationOutboxRepository.insertBacsPaymentEvent(payment, recordId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(METHOD.PROCESS_PAYMENT, LOG_MESSAGES.OUTBOX_INSERT_FAILED, {
      recordId,
      webhookId: payment.webhookId,
      applicationId: payment.paymentId,
      error: message,
    });
  }

  log.info(METHOD.PROCESS_PAYMENT, LOG_MESSAGES.PAYMENT_PROCESSING_COMPLETE, {
    recordId,
    transactionId: payment.transactionId,
    webhookId: payment.webhookId,
    paymentId: payment.paymentId,
  });
  log.end(METHOD.PROCESS_PAYMENT, { recordId, transactionId: payment.transactionId });
}

