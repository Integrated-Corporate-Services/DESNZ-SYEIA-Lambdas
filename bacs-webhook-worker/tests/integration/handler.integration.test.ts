import { handler } from '../../handler';
import type { SQSEvent, Context } from 'aws-lambda';

beforeAll(() => {
  process.env.NODE_ENV = 'dev';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
  process.env.SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || 'https://example.com/queue';
  process.env.LOG_LEVEL = 'error';
});

describe('handler integration tests', () => {
  it('should handle SQS event', async () => {
    const event: SQSEvent = {
      Records: [
        {
          messageId: 'msg-1',
          receiptHandle: 'handle-1',
          body: JSON.stringify({
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
          }),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          md5OfMessageAttributes: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:...',
          awsRegion: 'us-east-1',
        },
      ],
    };
    const context = {
      awsRequestId: 'request-123',
      functionName: 'bacs-webhook-worker',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:...',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/bacs-webhook-worker',
      logStreamName: '2024/01/01/[$LATEST]...',
      identity: undefined,
      clientContext: undefined,
      getRemainingTimeInMillis: () => 300000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    } as unknown as Context;

    const result = await handler(event, context);

    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('should handle empty records gracefully', async () => {
    const event: SQSEvent = { Records: [] };

    const context = {
      awsRequestId: 'request-123',
    } as unknown as Context;

    const result = await handler(event, context);

    expect(result.batchItemFailures).toHaveLength(0);
  });
});

