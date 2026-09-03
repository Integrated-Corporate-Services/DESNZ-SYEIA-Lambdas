import { MigrationBatchService } from '../src/migration-control/service';
import { ExecutionAlreadyExistsError } from '../src/aws/stores';

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

const request = {
  migrationBatchId: 'BATCH-001',
  ingestionMethod: 'DIRECT_S3' as const,
  bucket: 'migration-bucket',
  prefix: 'migrations/BATCH-001',
  manifestKey: 'migrations/BATCH-001/manifest.json',
  appflowExecutionId: null,
  appflowFlowName: null,
  correlationId: '00000000-0000-0000-0000-000000000001',
  eventTime: '2026-09-03T00:00:00.000Z',
};

const manifest = JSON.stringify({
  schemaVersion: '1.0',
  migrationBatchId: 'BATCH-001',
  ingestionMethod: 'DIRECT_S3',
  generatedAt: '2026-09-03T00:00:00.000Z',
  sourceSystem: 'SHAREPOINT_ONLINE',
  expectedCaseCount: 1,
  expectedDocumentCount: 1,
  casesFile: {
    key: 'migrations/BATCH-001/cases.csv',
    sizeBytes: 20,
    checksum: 'a'.repeat(64),
    checksumAlgorithm: 'SHA256',
  },
  documents: [{ key: 'migrations/BATCH-001/plan.pdf', sizeBytes: 10, checksum: 'b'.repeat(64) }],
});

function createRepository() {
  return {
    admit: jest.fn().mockResolvedValue({}),
    markValidated: jest.fn().mockResolvedValue(true),
    markStarted: jest.fn().mockResolvedValue(true),
    recordFailure: jest.fn(),
    get: jest.fn(),
  };
}

describe('MigrationBatchService direct S3 admission', () => {
  it('verifies checksums and starts WF1 with a deterministic name', async () => {
    const batches = createRepository();
    const s3 = {
      getText: jest.fn().mockResolvedValue(manifest),
      head: jest
        .fn()
        .mockImplementation((_bucket, key) =>
          Promise.resolve(
            key.endsWith('.csv')
              ? { size: 20, checksum: 'a'.repeat(64) }
              : { size: 10, checksum: 'b'.repeat(64) }
          )
        ),
    };
    const workflow = { start: jest.fn().mockResolvedValue('arn:execution') };
    const result = await new MigrationBatchService(
      config,
      s3,
      workflow,
      batches as never
    ).runPreflight(request);
    expect(result.outcome).toBe('WF1_STARTED');
    expect(workflow.start.mock.calls[0][0]).toMatch(/^BATCH-001-[a-f0-9]{16}$/);
    expect(batches.admit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      3600,
      1,
      1
    );
  });

  it('records and rejects a checksum mismatch before starting WF1', async () => {
    const batches = createRepository();
    const s3 = {
      getText: jest.fn().mockResolvedValue(manifest),
      head: jest.fn().mockResolvedValue({ size: 20, checksum: 'wrong' }),
    };
    const workflow = { start: jest.fn() };
    await expect(
      new MigrationBatchService(config, s3, workflow, batches as never).runPreflight(request)
    ).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(workflow.start).not.toHaveBeenCalled();
    expect(batches.recordFailure).toHaveBeenCalled();
  });

  it('treats an existing deterministic workflow execution as already started', async () => {
    const batches = createRepository();
    const s3 = {
      getText: jest.fn().mockResolvedValue(manifest),
      head: jest
        .fn()
        .mockImplementation((_bucket, key) =>
          Promise.resolve(
            key.endsWith('.csv')
              ? { size: 20, checksum: 'a'.repeat(64) }
              : { size: 10, checksum: 'b'.repeat(64) }
          )
        ),
    };
    const workflow = { start: jest.fn().mockRejectedValue(new ExecutionAlreadyExistsError()) };
    const result = await new MigrationBatchService(
      config,
      s3,
      workflow,
      batches as never
    ).runPreflight(request);
    expect(result.outcome).toBe('ALREADY_STARTED');
    expect(batches.markStarted).toHaveBeenCalledWith('BATCH-001', request.correlationId, null);
  });

  it('propagates infrastructure failures for Lambda retry handling', async () => {
    const batches = createRepository();
    const s3 = {
      getText: jest.fn().mockRejectedValue(new Error('S3 temporarily unavailable')),
      head: jest.fn(),
    };
    const workflow = { start: jest.fn() };
    await expect(
      new MigrationBatchService(config, s3, workflow, batches as never).runPreflight(request)
    ).rejects.toThrow('S3 temporarily unavailable');
  });
});
