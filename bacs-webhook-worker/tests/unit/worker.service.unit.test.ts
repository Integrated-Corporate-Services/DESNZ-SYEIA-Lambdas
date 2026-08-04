import { workerService } from '../../../src/services/worker.service';
import { ValidationError, PaymentProcessingError } from '../../../src/errors/worker.errors';
import type { ProcessResult } from '../../../src/types';

describe('workerService', () => {
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
