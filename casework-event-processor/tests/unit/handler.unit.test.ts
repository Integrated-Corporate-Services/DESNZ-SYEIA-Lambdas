import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import type { Pool, PoolClient } from 'pg';

jest.mock('../../src/config/env.config', () => ({
  getPool: jest.fn(),
  validateEnvironment: jest.fn(),
}));

import { getPool } from '../../src/config/env.config';
import { handler } from '../../handler';

const parserConfig = {
  detailType: 'Casework_Event__e',
  sourcePrefix: 'aws.partner/salesforce.com/',
};

function validBody(): string {
  return JSON.stringify({
    source: 'aws.partner/salesforce.com/example',
    'detail-type': parserConfig.detailType,
    id: 'sf-event-1',
    detail: {
      payload: {
        Event_Type__c: 'FURTHER_INFORMATION_REQUEST',
        Schema_Version__c: '1',
        Application_Id__c: '550e8400-e29b-41d4-a716-446655440000',
        Application_Type__c: 'S37',
        Correlation_Id__c: 'CORR-123',
        Case_Id__c: '500001',
        CreatedById: '005001',
        CreatedDate: '2026-09-27T10:00:00.000Z',
        Payload__c: JSON.stringify({
          requestId: 'REQ-001',
          responseDueDate: '2026-10-15',
          message: 'Please provide information',
          requestedDocuments: ['Project'],
        }),
      },
    },
  });
}

function sqsEvent(body: string): SQSEvent {
  const record = {
    messageId: 'msg-1',
    body,
  } as SQSRecord;
  return { Records: [record] };
}

function lambdaContext(): Context {
  return {
    awsRequestId: 'request-1',
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'casework-event-processor',
    functionVersion: '1',
  } as Context;
}

describe('event processor handler', () => {
  const query = jest.fn();
  const release = jest.fn();
  const connect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://test';
    process.env.EVENT_DETAIL_TYPE = parserConfig.detailType;
    process.env.EVENT_SOURCE_PREFIX = parserConfig.sourcePrefix;

    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO integration_inbox')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('INSERT INTO further_information_request\n')) {
        return { rowCount: 1, rows: [{ further_information_request_id: 'fir-db-id' }] };
      }
      return { rowCount: 1, rows: [] };
    });

    connect.mockResolvedValue({ query, release } as unknown as PoolClient);
    (getPool as jest.Mock).mockResolvedValue({ connect } as unknown as Pool);
  });

  it('creates a request and commits the inbox record in one transaction', async () => {
    const response = await handler(sqsEvent(validBody()), lambdaContext());

    expect(response).toEqual({ batchItemFailures: [] });
    expect(query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'INSERT',
      'INSERT',
      'UPDATE',
      'COMMIT',
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO further_information_request'),
      [
        '550e8400-e29b-41d4-a716-446655440000',
        'Please provide information',
        '2026-10-15',
        'REQ-001',
        'external-event-relay',
        new Date('2026-09-27T10:00:00.000Z'),
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO further_information_request_category'),
      ['fir-db-id', 'Project', 1],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO integration_inbox'),
      ['sf-event-1', 'external-crm', 'FURTHER_INFORMATION_REQUEST', '1', '550e8400-e29b-41d4-a716-446655440000', 'S37', 'CORR-123', '500001'],
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('acknowledges duplicate source event IDs without creating another request', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO integration_inbox')) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });

    const response = await handler(sqsEvent(validBody()), lambdaContext());

    expect(response).toEqual({ batchItemFailures: [] });
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO further_information_request'),
      expect.anything(),
    );
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('returns malformed messages as partial batch failures', async () => {
    const response = await handler(sqsEvent('{'), lambdaContext());

    expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: 'msg-1' }] });
    expect(connect).not.toHaveBeenCalled();
  });

  it('returns every record for retry when database setup fails', async () => {
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'));
    const event = sqsEvent(validBody());
    event.Records.push({
      ...(event.Records[0] as SQSRecord),
      messageId: 'msg-2',
    });

    const response = await handler(event, lambdaContext());

    expect(response).toEqual({
      batchItemFailures: [
        { itemIdentifier: 'msg-1' },
        { itemIdentifier: 'msg-2' },
      ],
    });
    expect(connect).not.toHaveBeenCalled();
  });
});