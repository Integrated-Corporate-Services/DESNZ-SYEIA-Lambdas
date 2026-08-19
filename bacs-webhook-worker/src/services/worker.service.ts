import type { SQSRecord } from 'aws-lambda';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import { ValidationError, PaymentProcessingError } from '../errors/worker.errors';
import { paymentRepository } from '../repositories/payment.repository';

const log = createLogger('worker.service');

export const workerService = {
  processRecords: async (
    records: SQSRecord[]
  ): Promise<Array<{ itemIdentifier: string }>> => {
    log.debug('Processing SQS records', { count: records.length });

    const batchItemFailures: Array<{ itemIdentifier: string }> = [];
    let processed = 0;
    let failed = 0;

    for (const record of records) {
      const messageId = record.messageId;

      try {
        log.info('Worker: processing SQS message', { messageId });

        // Parse and validate the message
        const payload = parsePayload(record.body);
        validatePayload(payload);

        // Process the payment
        await processPayment(payload);

        log.info('Worker: message processed successfully', {
          messageId,
          transactionId: payload.transactionId,
        });
        processed++;
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        log.error(LOG_MESSAGES.PROCESSING_FAILED, {
          messageId,
          error: errorMessage,
        });

        // Add to batch failures for retry
        batchItemFailures.push({ itemIdentifier: messageId });
      }
    }

    log.info('Record processing complete', {
      total: records.length,
      processed,
      failed,
      willRetry: batchItemFailures.length,
    });

    return batchItemFailures;
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
  const transactionId = payload.transactionId as string;
  const amount = payload.amount as number;
  const status = payload.status as string;

  log.debug('Processing payment', { transactionId, amount, status });

  if (!transactionId) {
    throw new PaymentProcessingError('Invalid transaction ID');
  }

  // Record payment in database
  await paymentRepository.recordPayment(transactionId, amount, status);

  log.info(LOG_MESSAGES.PROCESSING_SUCCESS, { transactionId, status });
}
