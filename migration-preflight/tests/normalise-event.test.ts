import { normaliseEvent } from '../src/events/normalise-event';

const config = {
  migrationBucket: 'migration-bucket',
  wf1StateMachineArn: 'arn:aws:states:eu-west-2:123456789012:stateMachine:wf1',
  databaseUrl: 'postgres://example',
  migrationPrefixRoot: 'migrations',
  manifestFilename: 'manifest.json',
  manifestMaxBytes: 1024,
  staleAfterSeconds: 3600,
  dbSchema: 'migration_control',
};

describe('normaliseEvent direct S3', () => {
  it('accepts a manifest in the configured migration prefix', () => {
    const request = normaliseEvent(
      {
        Records: [
          {
            s3: {
              bucket: { name: 'migration-bucket' },
              object: { key: 'migrations/BATCH-001/manifest.json' },
            },
          },
        ],
      },
      config,
      { awsRequestId: 'request-1' }
    );
    expect(request).toMatchObject({
      migrationBatchId: 'BATCH-001',
      ingestionMethod: 'DIRECT_S3',
      prefix: 'migrations/BATCH-001',
    });
  });

  it('accepts an EventBridge S3 Object Created manifest event', () => {
    const request = normaliseEvent(
      {
        version: '0',
        id: 'event-1',
        source: 'aws.s3',
        'detail-type': 'Object Created',
        time: '2026-09-03T12:00:00.000Z',
        detail: {
          bucket: { name: 'migration-bucket' },
          object: { key: 'migrations/BATCH-002/manifest.json' },
        },
      },
      config,
      { awsRequestId: '' }
    );
    expect(request).toMatchObject({
      migrationBatchId: 'BATCH-002',
      ingestionMethod: 'DIRECT_S3',
      correlationId: 'event-1',
      eventTime: '2026-09-03T12:00:00.000Z',
    });
  });

  it('derives an AppFlow manifest location from the successful flow execution ID', () => {
    const request = normaliseEvent(
      {
        id: 'appflow-event-1',
        source: 'aws.appflow',
        'detail-type': 'AppFlow End Flow Run Report',
        time: '2026-09-03T12:00:00.000Z',
        detail: {
          'flow-name': 'nwl-sharepoint-import',
          'flow-execution-id': 'execution-001',
          status: 'Successful',
        },
      },
      config,
      { awsRequestId: '' }
    );
    expect(request).toMatchObject({
      migrationBatchId: 'execution-001',
      ingestionMethod: 'APPFLOW',
      prefix: 'migrations/execution-001',
      manifestKey: 'migrations/execution-001/manifest.json',
      appflowFlowName: 'nwl-sharepoint-import',
      appflowExecutionId: 'execution-001',
    });
  });

  it('rejects an unsuccessful AppFlow completion report', () => {
    expect(() =>
      normaliseEvent(
        {
          source: 'aws.appflow',
          'detail-type': 'AppFlow End Flow Run Report',
          detail: {
            'flow-name': 'nwl-sharepoint-import',
            'flow-execution-id': 'execution-001',
            status: 'Error',
          },
        },
        config,
        { awsRequestId: 'request-1' }
      )
    ).toThrow('AppFlow event is not a successful flow completion');
  });

  it('rejects a manifest outside the configured migration prefix', () => {
    expect(() =>
      normaliseEvent(
        {
          Records: [
            {
              s3: {
                bucket: { name: 'migration-bucket' },
                object: { key: 'untrusted/BATCH-001/manifest.json' },
              },
            },
          ],
        },
        config,
        { awsRequestId: 'request-1' }
      )
    ).toThrow('Event is not a migration manifest');
  });
});
