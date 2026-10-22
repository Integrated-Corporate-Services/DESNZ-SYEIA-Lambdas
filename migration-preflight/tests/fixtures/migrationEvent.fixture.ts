import type { MigrationRequest } from '../../src/types/migrationPreflight.types';

export function createRequest(overrides: Partial<MigrationRequest> = {}): MigrationRequest {
  return {
    migrationBatchId: 'TEST-BATCH-001',
    ingestionMethod: 'DIRECT_S3',
    bucket: 'test-migration-bucket',
    prefix: 'migrations/TEST-BATCH-001',
    manifestKey: 'migrations/TEST-BATCH-001/manifest.json',
    appflowExecutionId: null,
    appflowFlowName: null,
    correlationId: '11111111-1111-4111-8111-111111111111',
    eventTime: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

export function createS3Event(key = 'migrations/TEST-BATCH-001/manifest.json') {
  return { Records: [{ s3: { bucket: { name: 'test-migration-bucket' }, object: { key } } }] };
}

export function createEventBridgeEvent(key = 'migrations/TEST-BATCH-001/manifest.json') {
  return {
    id: 'event-1',
    source: 'aws.s3',
    'detail-type': 'Object Created',
    time: '2026-09-03T12:00:00.000Z',
    detail: { bucket: { name: 'test-migration-bucket' }, object: { key } },
  };
}

export function createAppFlowEvent(status = 'Successful') {
  return {
    id: 'appflow-1',
    source: 'aws.appflow',
    'detail-type': 'AppFlow End Flow Run Report',
    detail: { 'flow-name': 'nwl-sharepoint-import', 'flow-execution-id': 'execution-001', status },
  };
}
