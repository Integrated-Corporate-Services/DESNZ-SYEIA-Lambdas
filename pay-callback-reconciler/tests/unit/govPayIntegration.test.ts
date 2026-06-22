/**
 * Integration-style test: paymentProcessor → govPayApiValidator → govPayApiClient (mocked fetch)
 * Verifies the full GOV.UK REST validation path without mocking the validator layer.
 */
import { processPaymentFromSQS } from '../../src/services/paymentProcessor.js';
import { resetGovPayConfigCache } from '../../src/util/govPayConfig.js';
import type { Context, SQSRecord } from 'aws-lambda';

const mockQuery = jest.fn();
const originalFetch = global.fetch;

jest.mock('../../src/util/database.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  beginTransaction: async () => mockQuery('BEGIN'),
  commitTransaction: async () => mockQuery('COMMIT'),
  rollbackTransaction: async () => mockQuery('ROLLBACK'),
  ensurePoolInitialized: jest.fn(),
}));

jest.mock('../../src/util/metrics.js', () => ({ recordMetric: jest.fn() }));
jest.mock('../../src/util/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockContext = {
  awsRequestId: 'req-govpay-int',
  getRemainingTimeInMillis: () => 30000,
} as Context;

function buildSqsRecord(body: object): SQSRecord {
  return {
    messageId: 'msg-govpay',
    receiptHandle: 'rh-govpay',
    body: JSON.stringify(body),
    attributes: {},
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:eu-west-2:123:queue',
    awsRegion: 'eu-west-2',
  };
}

describe('GOV.UK Pay API integration path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGovPayConfigCache();
    process.env.GOVPAY_API_KEY = 'integration-test-key';
    process.env.GOVPAY_API_URL = 'https://publicapi.payments.service.gov.uk/v1/payments';
    delete process.env.GOVPAY_API_VALIDATION_ENABLED;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
        amount: 10000,
        state: { status: 'success', finished: true },
      }),
    }) as unknown as typeof fetch;

    mockQuery.mockImplementation(async (text: string) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [], rowCount: 0, command: text, oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO payment_events') && text.includes('ON CONFLICT')) {
        return { rows: [{ event_id: 'evt-int' }], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      if (text.includes('FROM payment') && text.includes('payment_id = $1') && !text.includes('UPDATE')) {
        return {
          rows: [{
            id: 1,
            payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
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
            payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
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
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOVPAY_API_KEY;
    delete process.env.GOVPAY_API_URL;
    resetGovPayConfigCache();
  });

  test('calls GOV.UK API then processes payment when validation passes', async () => {
    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-int',
        paymentId: 'ssci1bmuo1s8sbbmnoih34otg9',
        eventType: 'card_payment_succeeded',
        source: 'inbound-event-receiver',
      },
      webhook: {
        webhook_message_id: 'evt-int',
        event_type: 'card_payment_succeeded',
        resource: {
          payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
          amount: 10000,
          state: { status: 'success', finished: true },
        },
      },
    });

    const result = await processPaymentFromSQS(record, mockContext);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://publicapi.payments.service.gov.uk/v1/payments/ssci1bmuo1s8sbbmnoih34otg9',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.action).toBe('PROCESSED');
    expect(mockQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
  });

  test('aborts before DB when GOV.UK API returns mismatched status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
        amount: 10000,
        state: { status: 'failed' },
      }),
    }) as unknown as typeof fetch;

    const record = buildSqsRecord({
      metadata: {
        webhookId: 'evt-mismatch',
        paymentId: 'ssci1bmuo1s8sbbmnoih34otg9',
        eventType: 'card_payment_succeeded',
        source: 'inbound-event-receiver',
      },
      webhook: {
        event_type: 'card_payment_succeeded',
        resource: {
          payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
          amount: 10000,
          state: { status: 'success' },
        },
      },
    });

    await expect(processPaymentFromSQS(record, mockContext)).rejects.toThrow('does not match webhook');
    expect(mockQuery).not.toHaveBeenCalledWith('BEGIN');
  });
});
