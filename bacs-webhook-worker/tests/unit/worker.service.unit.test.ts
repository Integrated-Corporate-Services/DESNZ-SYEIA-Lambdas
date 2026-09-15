jest.mock('../../src/repositories/payment.repository', () => ({
  paymentRepository: {
    recordPayment: jest.fn().mockResolvedValue(undefined),
    markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    getPaymentStatus: jest.fn().mockResolvedValue(null),
    findApplicationByInvoiceNumber: jest.fn().mockResolvedValue(null),
    findDesnzReferenceByApplicationId: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/repositories/applicationOutbox.repository', () => ({
  applicationOutboxRepository: {
    insertBacsPaymentEvent: jest.fn().mockResolvedValue(null),
  },
}));

import { workerService } from '../../src/services/worker.service';

function validEnvelopeBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: '1',
    source: 'BACS',
    webhookId: 'webhook-1',
    paymentId: 'payment-123',
    eventType: 'PAYMENT_STATUS_UPDATED',
    status: 'PAID',
    correlationId: 'correlation-1',
    receivedAt: '2026-01-01T00:00:00.000Z',
    payload: {
      event: {
        eventId: 'event-1',
        eventType: 'PAYMENT_STATUS_UPDATED',
        eventVersion: '1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: 'UKSBS',
      },
      callback: {
        deliveryId: 'delivery-1',
        attemptNumber: 1,
      },
      payment: {
        paymentReference: 'txn-123',
      },
      detail: {
        status: 'success',
        amount: 100,
        currency: 'GBP',
      },
    },
    ...overrides,
  });
}

describe('workerService', () => {
  describe('processRecords', () => {
    it('should process valid records successfully', async () => {
      const records = [
        {
          messageId: 'msg-1',
          receiptHandle: 'handle-1',
          body: validEnvelopeBody(),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
      ];

      const result = await workerService.processRecords(records);

      expect(result.processed).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle invalid JSON in message body', async () => {
      const records = [
        {
          messageId: 'msg-2',
          receiptHandle: 'handle-2',
          body: 'invalid json',
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
      ];

      const result = await workerService.processRecords(records);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle missing required fields', async () => {
      const records = [
        {
          messageId: 'msg-3',
          receiptHandle: 'handle-3',
          body: JSON.stringify({ transactionId: 'txn-456' }),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
      ];

      const result = await workerService.processRecords(records);

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(1);
    });
  });
});

