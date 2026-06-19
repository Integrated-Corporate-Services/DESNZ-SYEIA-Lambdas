import { processPaymentFromSQS } from '../../src/services/paymentProcessor.js';
import { validateSignature } from '../../src/validators/signatureValidator.js';
import type { Context, SQSRecord } from 'aws-lambda';

const mockQuery = jest.fn();

jest.mock('../../src/util/database.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  beginTransaction: async () => mockQuery('BEGIN'),
  commitTransaction: async () => mockQuery('COMMIT'),
  rollbackTransaction: async () => mockQuery('ROLLBACK'),
  ensurePoolInitialized: jest.fn(),
}));

jest.mock('../../src/validators/signatureValidator.js');
jest.mock('../../src/util/metrics.js', () => ({ recordMetric: jest.fn() }));
jest.mock('../../src/util/webhookSecret.js', () => ({
  getGovukPayWebhookSecret: () => 'test-secret',
}));

const mockValidateSignature = validateSignature as jest.MockedFunction<typeof validateSignature>;

const mockContext = {
  awsRequestId: 'req-1',
  getRemainingTimeInMillis: () => 30000,
} as Context;

function buildSqsRecord(body: object): SQSRecord {
  return {
    messageId: 'msg-1',
    receiptHandle: 'rh-1',
    body: JSON.stringify(body),
    attributes: {},
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:eu-west-2:123:queue',
    awsRegion: 'eu-west-2',
  };
}

const baseWebhook = {
  webhook_message_id: 'evt-1',
  api_version: 1,
  created_date: '2026-06-19T10:00:00.000Z',
  resource_id: 'pay_flow_001',
  resource_type: 'payment',
  event_type: 'card_payment_succeeded',
  resource: {
    payment_id: 'pay_flow_001',
    amount: 10000,
    reference: 'REF-001',
    description: 'Test',
    state: { status: 'success', finished: true },
  },
};

describe('paymentProcessor - webhook flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateSignature.mockReturnValue(true);
    mockQuery.mockImplementation(async (text: string) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0, command: text, oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO payment_events') && text.includes('ON CONFLICT')) {
        return { rows: [{ event_id: 'evt-1' }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      if (text.includes('FROM payment') && text.includes('payment_id = $1') && !text.includes('UPDATE')) {
        return {
          rows: [{
            id: 1,
            payment_id: 'pay_flow_001',
            application_id: 'app-uuid-1',
            status: 'created',
            amount: 10000,
            reference: 'REF-001',
            description: 'Test',
          }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        };
      }
      if (text.includes('FROM payment_events')) {
        return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
      }
      if (text.includes('UPDATE payment SET')) {
        return {
          rows: [{
            id: 1,
            payment_id: 'pay_flow_001',
            application_id: 'app-uuid-1',
            status: 'confirmed',
            amount: 10000,
            finished: true,
          }],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        };
      }
      if (text.includes('UPDATE payment_webhooks')) {
        return { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO application_outbox')) {
        return { rows: [{ outbox_id: 99 }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
  });

  test('processes card_payment_succeeded and updates public.payment', async () => {
    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-1',
        paymentId: 'pay_flow_001',
        eventType: 'card_payment_succeeded',
        source: 'inbound-event-receiver',
      },
      webhook: baseWebhook,
    });

    const result = await processPaymentFromSQS(record, mockContext);

    expect(result.action).toBe('PROCESSED');
    expect(result.payment?.status).toBe('confirmed');
    expect(mockQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE payment SET'), expect.any(Array));
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payment_webhooks'),
      ['processed', 'evt-1']
    );
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO application_outbox'),
      expect.any(Array)
    );
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
  });

  test('writes application_outbox when ENABLE_APPLICATION_OUTBOX=true', async () => {
    process.env.ENABLE_APPLICATION_OUTBOX = 'true';

    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-outbox',
        paymentId: 'pay_flow_001',
        eventType: 'card_payment_succeeded',
        source: 'inbound-event-receiver',
      },
      webhook: { ...baseWebhook, webhook_message_id: 'evt-outbox' },
    });

    await processPaymentFromSQS(record, mockContext);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO application_outbox'),
      expect.arrayContaining(['app-uuid-1', 'PAYMENT_CONFIRMED', expect.any(String)])
    );

    delete process.env.ENABLE_APPLICATION_OUTBOX;
  });

  test('fails when payment row does not exist', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text === 'BEGIN' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0, command: text, oid: 0, fields: [] };
      }
      if (text.includes('ON CONFLICT')) {
        return { rows: [{ event_id: 'evt-2' }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      if (text.includes('FROM payment') && text.includes('payment_id')) {
        return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });

    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-2',
        paymentId: 'missing_pay',
        eventType: 'card_payment_succeeded',
        source: 'inbound-event-receiver',
      },
      webhook: {
        ...baseWebhook,
        webhook_message_id: 'evt-2',
        resource_id: 'missing_pay',
        resource: { payment_id: 'missing_pay', state: { status: 'success', finished: true } },
      },
    });

    await expect(processPaymentFromSQS(record, mockContext)).rejects.toThrow(
      'Payment not found for payment_id=missing_pay'
    );
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  test('skips application_outbox by default', async () => {
    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-3',
        paymentId: 'pay_flow_001',
        eventType: 'card_payment_succeeded',
        source: 'inbound-event-receiver',
      },
      webhook: { ...baseWebhook, webhook_message_id: 'evt-3' },
    });

    await processPaymentFromSQS(record, mockContext);

    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO application_outbox'),
      expect.any(Array)
    );
  });

  test('rolls back and throws on out-of-order captured before succeeded (SQS retry)', async () => {
    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-captured',
        paymentId: 'pay_flow_001',
        eventType: 'card_payment_captured',
        source: 'inbound-event-receiver',
      },
      webhook: {
        ...baseWebhook,
        webhook_message_id: 'evt-captured',
        event_type: 'card_payment_captured',
        resource: {
          ...baseWebhook.resource,
          state: { status: 'submitted', finished: false },
        },
      },
    });

    await expect(processPaymentFromSQS(record, mockContext)).rejects.toThrow('Out-of-order webhook');
    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockQuery).not.toHaveBeenCalledWith('COMMIT');
  });
});
