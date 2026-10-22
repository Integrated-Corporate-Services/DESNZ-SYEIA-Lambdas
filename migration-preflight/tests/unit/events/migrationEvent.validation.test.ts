import { normaliseEvent } from '../../../src/events/migrationEvent.validation';
import { createConfig } from '../../fixtures/migrationConfig.fixture';
import {
  createS3Event,
  createEventBridgeEvent,
  createAppFlowEvent,
} from '../../fixtures/migrationEvent.fixture';

describe('migration event normalisation', () => {
  it('accepts a direct S3 manifest', () => {
    expect(
      normaliseEvent(createS3Event(), createConfig(), { awsRequestId: 'request-1' })
    ).toMatchObject({
      migrationBatchId: 'TEST-BATCH-001',
      ingestionMethod: 'DIRECT_S3',
      prefix: 'migrations/TEST-BATCH-001',
    });
  });

  it('uses EventBridge ID/time when AWS request ID is empty', () => {
    expect(
      normaliseEvent(createEventBridgeEvent(), createConfig(), { awsRequestId: '' })
    ).toMatchObject({
      correlationId: 'event-1',
      eventTime: '2026-09-03T12:00:00.000Z',
    });
  });

  it('derives AppFlow manifest location from execution ID', () => {
    expect(
      normaliseEvent(createAppFlowEvent(), createConfig(), { awsRequestId: '' })
    ).toMatchObject({
      migrationBatchId: 'execution-001',
      ingestionMethod: 'APPFLOW',
      manifestKey: 'migrations/execution-001/manifest.json',
      appflowFlowName: 'nwl-sharepoint-import',
    });
  });

  it('rejects unsuccessful AppFlow completion', () => {
    expect(() =>
      normaliseEvent(createAppFlowEvent('Error'), createConfig(), { awsRequestId: 'id' })
    ).toThrow('not a successful flow completion');
  });

  it('rejects a manifest outside the allowed prefix', () => {
    expect(() =>
      normaliseEvent(createS3Event('untrusted/BATCH/manifest.json'), createConfig(), {
        awsRequestId: 'id',
      })
    ).toThrow('not a migration manifest');
  });

  it('rejects a different bucket and ordinary document events', () => {
    const event = createS3Event();
    event.Records[0].s3.bucket.name = 'other-bucket';
    expect(() => normaliseEvent(event, createConfig(), { awsRequestId: 'id' })).toThrow(
      'not a migration manifest'
    );
    expect(() =>
      normaliseEvent(createS3Event('migrations/BATCH/plan.pdf'), createConfig(), {
        awsRequestId: 'id',
      })
    ).toThrow('not a migration manifest');
  });

  it('preserves literal EventBridge plus signs but decodes classic S3 encoding', () => {
    const context = { awsRequestId: 'id' };
    expect(
      normaliseEvent(
        createEventBridgeEvent('migrations/BATCH+one/manifest.json'),
        createConfig(),
        context
      ).migrationBatchId
    ).toBe('BATCH+one');
    expect(
      normaliseEvent(createS3Event('migrations/BATCH%2Bone/manifest.json'), createConfig(), context)
        .migrationBatchId
    ).toBe('BATCH+one');
  });

  it('rejects null events and corrupt classic S3 encoding', () => {
    expect(() => normaliseEvent(null, createConfig(), { awsRequestId: 'id' })).toThrow(
      'Event must be an object'
    );
    expect(() =>
      normaliseEvent(createS3Event('%invalid'), createConfig(), { awsRequestId: 'id' })
    ).toThrow('Invalid encoded');
  });
});
