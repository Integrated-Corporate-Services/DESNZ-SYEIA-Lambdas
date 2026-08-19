import { workerService } from '../../src/services/worker.service';
import { paymentRepository } from '../../src/repositories/payment.repository';

// Mock the payment repository
jest.mock('../../src/repositories/payment.repository', () => ({
  paymentRepository: {
    recordPayment: jest.fn(),
  },
}));

describe('workerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processRecords', () => {
    it('should process valid records successfully', async () => {
      const records = [
        {
          messageId: 'msg-1',
          receiptHandle: 'handle-1',
          body: JSON.stringify({
            transactionId: 'txn-123',
            amount: 100,
            status: 'success',
          }),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
      ];

      (paymentRepository.recordPayment as jest.Mock).mockResolvedValue(undefined);

      const batchItemFailures = await workerService.processRecords(records);

      expect(batchItemFailures).toHaveLength(0);
      expect(paymentRepository.recordPayment).toHaveBeenCalledWith('txn-123', 100, 'success');
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

      const batchItemFailures = await workerService.processRecords(records);

      expect(batchItemFailures).toHaveLength(1);
      expect(batchItemFailures[0].itemIdentifier).toBe('msg-2');
      expect(paymentRepository.recordPayment).not.toHaveBeenCalled();
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

      const batchItemFailures = await workerService.processRecords(records);

      expect(batchItemFailures).toHaveLength(1);
      expect(batchItemFailures[0].itemIdentifier).toBe('msg-3');
      expect(paymentRepository.recordPayment).not.toHaveBeenCalled();
    });

    it('should continue processing on individual failures', async () => {
      const records = [
        {
          messageId: 'msg-4',
          receiptHandle: 'handle-4',
          body: JSON.stringify({ transactionId: 'txn-789', amount: 50, status: 'pending' }),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
        {
          messageId: 'msg-5',
          receiptHandle: 'handle-5',
          body: 'invalid',
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
      ];

      (paymentRepository.recordPayment as jest.Mock).mockResolvedValue(undefined);

      const batchItemFailures = await workerService.processRecords(records);

      expect(batchItemFailures).toHaveLength(1);
      expect(batchItemFailures[0].itemIdentifier).toBe('msg-5');
      expect(paymentRepository.recordPayment).toHaveBeenCalledTimes(1);
    });
  });
});
