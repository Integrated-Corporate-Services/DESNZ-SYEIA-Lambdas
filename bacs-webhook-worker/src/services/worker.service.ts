import type { SQSRecord } from 'aws-lambda';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import type { WorkerSummary, BacsWebhookRelayEnvelope, UkSbsWebhookPayload, ProcessablePayment } from '../types';
import { ValidationError } from '../errors/worker.errors';
import { paymentRepository } from '../repositories/payment.repository';

const log = createLogger('worker.service');

export const workerService = {
  processRecords: async (records: SQSRecord[]): Promise<WorkerSummary> => {
    log.info('[SQS] Starting to process SQS records', { count: records.length });

    let processed = 0;
    let failed = 0;
    const errors: Array<{ message: string; recordId: string }> = [];

    for (const record of records) {
      try {
        log.info('[SQS] Processing individual SQS message', { 
          recordId: record.messageId,
          messageBody: record.body,
        });

        // Parse envelope from relay
        const envelope = parsePayload(record.body);
        
        log.info('[PAYLOAD] Parsed envelope from SQS message', {
          recordId: record.messageId,
          webhookId: envelope.webhookId,
          paymentId: envelope.paymentId,
          eventType: envelope.eventType,
          source: envelope.source,
          schemaVersion: envelope.schemaVersion,
          receivedAt: envelope.receivedAt,
          correlationId: envelope.correlationId,
          payloadKeys: Object.keys(envelope.payload || {}),
        });
        
        // Validate and transform to internal format
        const payment = validateAndTransform(envelope);
        
        log.info('[PAYLOAD] Transformed payment data ready for processing', {
          recordId: record.messageId,
          webhookId: payment.webhookId,
          paymentId: payment.paymentId,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          eventType: payment.eventType,
          bacsReference: payment.bacsReference,
        });

        // Process the payment
        await processPayment(payment);

        log.info('[PROCESSING] Successfully completed processing for record', { 
          recordId: record.messageId,
          webhookId: payment.webhookId,
          transactionId: payment.transactionId,
        });
        processed++;
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          message,
          recordId: record.messageId || '',
        });

        log.error(LOG_MESSAGES.PROCESSING_FAILED, {
          recordId: record.messageId,
          error: message,
        });
      }
    }

    log.info('Record processing complete', { processed, failed, errors: errors.length });

    return { processed, failed, errors };
  },
};

function parsePayload(body: string | null): BacsWebhookRelayEnvelope {
  if (!body) {
    throw new ValidationError('Empty message body');
  }

  try {
    const envelope: unknown = JSON.parse(body);

    if (typeof envelope !== 'object' || envelope === null) {
      throw new ValidationError('Invalid message envelope');
    }

    const env = envelope as Record<string, unknown>;

    // Validate envelope structure
    if (env.schemaVersion !== '1') {
      throw new ValidationError('Invalid or missing schemaVersion');
    }

    if (env.source !== 'BACS') {
      throw new ValidationError('Invalid or missing source');
    }

    return env as BacsWebhookRelayEnvelope;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid JSON in message body');
  }
}

function validateAndTransform(envelope: BacsWebhookRelayEnvelope): ProcessablePayment {
  const { payload } = envelope;
  
  log.info('[VALIDATION] Validating envelope structure', {
    webhookId: envelope.webhookId,
    paymentId: envelope.paymentId,
    source: envelope.source,
    schemaVersion: envelope.schemaVersion,
  });
  
  // Validate envelope metadata
  const requiredEnvFields = ['webhookId', 'paymentId', 'eventType', 'receivedAt'];
  const missingEnv = requiredEnvFields.filter((key) => !envelope[key as keyof BacsWebhookRelayEnvelope]);
  
  if (missingEnv.length > 0) {
    throw new ValidationError(`Missing envelope fields: ${missingEnv.join(', ')}`);
  }

  // Cast to UKSBS payload structure
  const uksbsPayload = payload as unknown as UkSbsWebhookPayload;
  
  log.info('[VALIDATION] Extracted UKSBS payload from envelope', {
    paymentReference: uksbsPayload.payment?.paymentReference,
    amount: uksbsPayload.detail?.amount,
    currency: uksbsPayload.detail?.currency,
    status: uksbsPayload.detail?.status,
    paymentDate: uksbsPayload.detail?.paymentDate,
    bacsReference: uksbsPayload.detail?.bacsReference,
    eventType: uksbsPayload.event?.eventType,
  });
  
  // Validate UKSBS payment reference
  if (!uksbsPayload.payment?.paymentReference) {
    throw new ValidationError('Missing payment.paymentReference in UKSBS webhook');
  }
  
  // Validate UKSBS amount
  if (uksbsPayload.detail?.amount == null || typeof uksbsPayload.detail.amount !== 'number' || Number.isNaN(uksbsPayload.detail.amount)) {
    throw new ValidationError('Missing or invalid detail.amount in UKSBS webhook');
  }
  
  // Validate UKSBS status
  if (!uksbsPayload.detail?.status) {
    throw new ValidationError('Missing detail.status in UKSBS webhook');
  }

  // Transform to internal format
  return {
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
}

async function processPayment(payment: ProcessablePayment): Promise<void> {
  log.info('[PROCESSING] Starting payment processing', { 
    transactionId: payment.transactionId,
    webhookId: payment.webhookId,
    paymentId: payment.paymentId,
    amount: payment.amount,
    status: payment.status,
  });

  // Record payment in payments table
  log.info('[DB] Recording payment in payments table', {
    transactionId: payment.transactionId,
    amount: payment.amount,
    status: payment.status,
  });
  
  await paymentRepository.recordPayment(
    payment.transactionId,
    payment.amount,
    payment.status
  );

  // Mark webhook as processed in payment_webhooks table
  log.info('[DB] Marking webhook as processed', {
    webhookId: payment.webhookId,
    processor: 'bacs-webhook-worker',
  });
  
  await paymentRepository.markWebhookProcessed(
    payment.webhookId,
    'bacs-webhook-worker'
  );

  log.info('[PROCESSING] Payment processing completed successfully', { 
    transactionId: payment.transactionId,
    webhookId: payment.webhookId,
    paymentId: payment.paymentId,
  });
}
