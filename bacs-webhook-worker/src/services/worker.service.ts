import type { SQSRecord } from 'aws-lambda';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import type { WorkerSummary } from '../types';
import { ValidationError, PaymentProcessingError } from '../errors/worker.errors';

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

        // Parse and validate the message
        const payload = parsePayload(record.body);
        validatePayload(payload);

        // Process the payment
        await processPayment(payload);

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

function parsePayload(body: string | null): Record<string, unknown> {
  if (!body) {
    throw new ValidationError('Empty message body');
  }

  try {
    const payload = JSON.parse(body);
    return payload;
  } catch (error) {
    throw new ValidationError('Invalid JSON in message body');
  }
}

function validatePayload(payload: Record<string, unknown>): void {
  const required = ['transactionId', 'amount', 'status'];
  const missing = required.filter((key) => !payload[key]);

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

async function processPayment(payload: Record<string, unknown>): Promise<void> {
  log.debug('Processing payment', { transactionId: payload.transactionId });

  // Add your business logic here

  if (!payload.transactionId) {
    throw new PaymentProcessingError('Invalid transaction ID');
  }

  log.info(LOG_MESSAGES.PROCESSING_SUCCESS, { transactionId: payload.transactionId });
}
