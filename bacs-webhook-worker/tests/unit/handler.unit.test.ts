jest.mock('../../src/config/env.config', () => ({
  envConfig: {
    load: jest.fn().mockResolvedValue({
      dbHost: 'localhost',
      dbPort: 5432,
      dbUser: 'test',
      dbPassword: 'test',
      dbName: 'test',
      sqsQueueUrl: 'https://example.com/queue',
      environment: 'dev',
      logLevel: 'error',
    }),
    get: jest.fn(),
  },
}));

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

import { handler } from '../../handler';
import type { SQSEvent, SQSRecord, Context } from 'aws-lambda';

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

function buildRecord(messageId: string, body: string): SQSRecord {
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

function buildContext(): Context {
  return {
    awsRequestId: 'request-123',
    functionName: 'bacs-webhook-worker',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:...',
    memoryLimitInMB: '128',
    logGroupName: '/aws/lambda/bacs-webhook-worker',
    logStreamName: '2026/01/01/[$LATEST]...',
    identity: undefined,
    clientContext: undefined,
    getRemainingTimeInMillis: () => 300000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  } as unknown as Context;
}

describe('handler batchItemFailures', () => {
  it('returns only the failing record messageId when the batch has a mix of success and failure', async () => {
    const event: SQSEvent = {
      Records: [
        buildRecord('msg-ok', validEnvelopeBody()),
        buildRecord('msg-bad', 'invalid json'),
      ],
    };

    const result = await handler(event, buildContext());

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-bad' }]);
  });

  it('returns no batchItemFailures when every record in the batch succeeds', async () => {
    const event: SQSEvent = {
      Records: [buildRecord('msg-ok-1', validEnvelopeBody())],
    };

    const result = await handler(event, buildContext());

    expect(result.batchItemFailures).toHaveLength(0);
  });
});
