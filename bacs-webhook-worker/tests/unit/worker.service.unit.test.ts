jest.mock('../../src/repositories/payment.repository', () => ({
  paymentRepository: {
    updatePaymentStatus: jest.fn().mockResolvedValue(undefined),
    markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    getPaymentStatus: jest.fn().mockResolvedValue(null),
    findApplicationByInvoiceNumber: jest.fn().mockResolvedValue(null),
    findDesnzReferenceByApplicationId: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/services/applicationOutbox.service', () => ({
  applicationOutboxService: {
    recordBacsPaymentEvent: jest.fn().mockResolvedValue(null),
  },
}));

import { workerService } from '../../src/services/worker.service';
import { paymentRepository } from '../../src/repositories/payment.repository';
import { applicationOutboxService } from '../../src/services/applicationOutbox.service';

const APPLICATION_ID = '11111111-1111-1111-1111-111111111111';

function sqsRecord(body: string, messageId: string) {
  return {
    messageId,
    receiptHandle: `handle-${messageId}`,
    body,
    attributes: {} as any,
    messageAttributes: {},
    md5OfBody: '',
    md5OfMessageAttributes: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:...',
    awsRegion: 'us-east-1',
  };
}

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
  beforeEach(() => {
    jest.clearAllMocks();
    (paymentRepository.findApplicationByInvoiceNumber as jest.Mock).mockResolvedValue({
      applicationId: APPLICATION_ID,
      invoiceNumber: 'txn-123',
      paymentMethod: 'BACS',
      amountPence: 100,
    });
    (paymentRepository.updatePaymentStatus as jest.Mock).mockResolvedValue({
      id: 42,
      applicationId: APPLICATION_ID,
      status: 'success',
    });
    (paymentRepository.markWebhookProcessed as jest.Mock).mockResolvedValue(undefined);
  });

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

    it('updates payment.status verbatim (as received in the webhook) using application_id from the invoice', async () => {
      const result = await workerService.processRecords([sqsRecord(validEnvelopeBody(), 'msg-4')]);

      expect(result.failed).toBe(0);
      expect(paymentRepository.findApplicationByInvoiceNumber).toHaveBeenCalledWith('txn-123');
      // Envelope's detail.status is 'success' (lowercase) - passed through unchanged, not translated.
      expect(paymentRepository.updatePaymentStatus).toHaveBeenCalledWith(
        APPLICATION_ID,
        'success',
      );
      expect(applicationOutboxService.recordBacsPaymentEvent).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
        expect.objectContaining({ applicationId: APPLICATION_ID }),
        'msg-4',
      );
    });

    it('logs a warning but still processes the payment when the webhook amount does not match the invoice', async () => {
      (paymentRepository.findApplicationByInvoiceNumber as jest.Mock).mockResolvedValue({
        applicationId: APPLICATION_ID,
        invoiceNumber: 'txn-123',
        paymentMethod: 'BACS',
        amountPence: 999999,
      });

      const result = await workerService.processRecords([sqsRecord(validEnvelopeBody(), 'msg-amount-mismatch')]);

      expect(result.failed).toBe(0);
      expect(paymentRepository.updatePaymentStatus).toHaveBeenCalledWith(APPLICATION_ID, 'success');
    });

    it('passes FAILED webhooks through verbatim to payment.status', async () => {
      (paymentRepository.updatePaymentStatus as jest.Mock).mockResolvedValue({
        id: 42,
        applicationId: APPLICATION_ID,
        status: 'FAILED',
      });

      const body = validEnvelopeBody({
        payload: {
          event: {
            eventId: 'event-1',
            eventType: 'PAYMENT_STATUS_UPDATED',
            eventVersion: '1',
            occurredAt: '2026-01-01T00:00:00.000Z',
            source: 'UKSBS',
          },
          callback: { deliveryId: 'delivery-1', attemptNumber: 1 },
          payment: { paymentReference: 'txn-123' },
          detail: { status: 'FAILED', amount: 100, currency: 'GBP' },
        },
      });

      const result = await workerService.processRecords([sqsRecord(body, 'msg-6')]);

      expect(result.failed).toBe(0);
      expect(paymentRepository.updatePaymentStatus).toHaveBeenCalledWith(
        APPLICATION_ID,
        'FAILED',
      );
    });

    it('fails the record when no invoice matches so SQS can retry', async () => {
      (paymentRepository.findApplicationByInvoiceNumber as jest.Mock).mockResolvedValue(null);

      const result = await workerService.processRecords([sqsRecord(validEnvelopeBody(), 'msg-5')]);

      expect(result.failed).toBe(1);
      expect(result.errors[0].recordId).toBe('msg-5');
      expect(paymentRepository.updatePaymentStatus).not.toHaveBeenCalled();
      expect(paymentRepository.markWebhookProcessed).not.toHaveBeenCalled();
    });

    it('fails the record when invoice exists but no payment row is updated so SQS can retry', async () => {
      (paymentRepository.updatePaymentStatus as jest.Mock).mockResolvedValue(null);

      const result = await workerService.processRecords([sqsRecord(validEnvelopeBody(), 'msg-7')]);

      expect(result.failed).toBe(1);
      expect(result.errors[0].recordId).toBe('msg-7');
      expect(paymentRepository.updatePaymentStatus).toHaveBeenCalledWith(
        APPLICATION_ID,
        'success',
      );
      expect(paymentRepository.markWebhookProcessed).not.toHaveBeenCalled();
    });

    it('fails the record when markWebhookProcessed rejects (e.g. webhookId not found) so SQS can retry', async () => {
      (paymentRepository.markWebhookProcessed as jest.Mock).mockRejectedValue(
        new Error('No payment_webhooks row found for webhookId webhook-1'),
      );

      const result = await workerService.processRecords([sqsRecord(validEnvelopeBody(), 'msg-not-found')]);

      expect(result.failed).toBe(1);
      expect(result.errors[0].recordId).toBe('msg-not-found');
      expect(applicationOutboxService.recordBacsPaymentEvent).not.toHaveBeenCalled();
    });

    it('fails the record when the UKSBS status is unmapped so it is not acknowledged or emitted', async () => {
      const body = validEnvelopeBody({
        payload: {
          event: {
            eventId: 'event-1',
            eventType: 'PAYMENT_STATUS_UPDATED',
            eventVersion: '1',
            occurredAt: '2026-01-01T00:00:00.000Z',
            source: 'UKSBS',
          },
          callback: { deliveryId: 'delivery-1', attemptNumber: 1 },
          payment: { paymentReference: 'txn-123' },
          detail: { status: 'PENDING', amount: 100, currency: 'GBP' },
        },
      });

      const result = await workerService.processRecords([sqsRecord(body, 'msg-8')]);

      expect(result.failed).toBe(1);
      expect(result.errors[0].recordId).toBe('msg-8');
      expect(paymentRepository.findApplicationByInvoiceNumber).not.toHaveBeenCalled();
      expect(paymentRepository.updatePaymentStatus).not.toHaveBeenCalled();
      expect(paymentRepository.markWebhookProcessed).not.toHaveBeenCalled();
      expect(applicationOutboxService.recordBacsPaymentEvent).not.toHaveBeenCalled();
    });
  });
});
