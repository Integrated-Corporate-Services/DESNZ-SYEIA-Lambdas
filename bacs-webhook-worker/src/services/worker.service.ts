import type { SQSRecord } from 'aws-lambda';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import type { WorkerSummary, BacsWebhookRelayEnvelope, UkSbsWebhookPayload, ProcessablePayment } from '../types';
import { ValidationError, PaymentProcessingError } from '../errors/worker.errors';
import { paymentRepository } from '../repositories/payment.repository';

const log = createLogger('worker.service');

export const workerService = {
  processRecords: async (records: SQSRecord[]): Promise<WorkerSummary> => {
    log.debug('Processing SQS records', { count: records.length });

    let processed = 0;
    let failed = 0;
    const errors: Array<{ message: string; recordId: string }> = [];

    for (const record of records) {
      try {
        log.start('processRecord', { recordId: record.messageId });

        // Parse envelope from relay
        const envelope = parsePayload(record.body);
        
        // Validate and transform to internal format
        const payment = validateAndTransform(envelope);

        // Process the payment
        await processPayment(payment);

        log.end('processRecord', { recordId: record.messageId });
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
    const envelope = JSON.parse(body);
    
    // Validate envelope structure
    if (!envelope.schemaVersion || envelope.schemaVersion !== '1') {
      throw new ValidationError('Invalid or missing schemaVersion');
    }
    
    if (!envelope.source || envelope.source !== 'BACS') {
      throw new ValidationError('Invalid or missing source');
    }

    return envelope as BacsWebhookRelayEnvelope;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid JSON in message body');
  }
}

function validateAndTransform(envelope: BacsWebhookRelayEnvelope): ProcessablePayment {
  const { payload } = envelope;
  
  // Validate envelope metadata
  const requiredEnvFields = ['webhookId', 'paymentId', 'eventType', 'receivedAt'];
  const missingEnv = requiredEnvFields.filter((key) => !envelope[key as keyof BacsWebhookRelayEnvelope]);
  
  if (missingEnv.length > 0) {
    throw new ValidationError(`Missing envelope fields: ${missingEnv.join(', ')}`);
  }

  // Cast to UKSBS payload structure
  const uksbsPayload = payload as unknown as UkSbsWebhookPayload;
  
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
  log.debug('Processing payment', { 
    transactionId: payment.transactionId,
    webhookId: payment.webhookId,
    paymentId: payment.paymentId,
  });

  // Record payment in payments table
  await paymentRepository.recordPayment(
    payment.transactionId,
    payment.amount,
    payment.status
  );

  // Mark webhook as processed in payment_webhooks table
  await paymentRepository.markWebhookProcessed(
    payment.webhookId,
    'bacs-webhook-worker'
  );

  log.info(LOG_MESSAGES.PROCESSING_SUCCESS, { 
    transactionId: payment.transactionId,
    webhookId: payment.webhookId,
  });
}
