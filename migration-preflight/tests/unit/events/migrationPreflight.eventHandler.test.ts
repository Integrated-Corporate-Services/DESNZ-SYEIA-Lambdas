import pino from 'pino';
import {
  createMigrationPreflightEventHandler,
  RunMigrationPreflight,
} from '../../../src/events/migrationPreflight.eventHandler';
import { MigrationError } from '../../../src/errors/migrationPreflight.error';
import { createConfig } from '../../fixtures/migrationConfig.fixture';
import { createS3Event } from '../../fixtures/migrationEvent.fixture';

function createEventHandler() {
  const run: jest.MockedFunction<RunMigrationPreflight> = jest.fn();
  const eventHandler = createMigrationPreflightEventHandler(
    createConfig(),
    pino({ enabled: false }),
    run
  );
  return { run, eventHandler };
}

describe('Lambda event/response boundary', () => {
  it('skips an unsupported event without invoking the use case', async () => {
    const { run, eventHandler } = createEventHandler();
    await expect(eventHandler(null, { awsRequestId: 'request-1' })).resolves.toMatchObject({
      outcome: 'SKIPPED',
      failureCode: 'UNSUPPORTED_EVENT',
      correlationId: 'request-1',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the normalised request and returns the use-case result', async () => {
    const { run, eventHandler } = createEventHandler();
    const result = {
      outcome: 'WF1_STARTED' as const,
      migrationBatchId: 'TEST-BATCH-001',
      correlationId: 'request-1',
      preflightStatus: 'WF1_STARTED' as const,
      stepFunctionExecutionArn: 'arn:execution',
      failureCode: null,
      failureReason: null,
    };
    run.mockResolvedValue(result);
    await expect(eventHandler(createS3Event(), { awsRequestId: 'request-1' })).resolves.toEqual(
      result
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        migrationBatchId: 'TEST-BATCH-001',
        correlationId: 'request-1',
        ingestionMethod: 'DIRECT_S3',
      })
    );
  });

  it('returns nonretryable domain failures as the existing response contract', async () => {
    const { run, eventHandler } = createEventHandler();
    run.mockRejectedValue(new MigrationError('INVALID_MANIFEST', 'bad manifest'));
    await expect(
      eventHandler(createS3Event(), { awsRequestId: 'request-1' })
    ).resolves.toMatchObject({
      outcome: 'PREFLIGHT_FAILED',
      migrationBatchId: null,
      preflightStatus: null,
      failureCode: 'INVALID_MANIFEST',
      failureReason: 'bad manifest',
    });
  });

  it.each([
    new MigrationError('MANIFEST_NOT_FOUND', 'not uploaded yet', true),
    new Error('database unavailable'),
  ])('rethrows retryable/infrastructure failures: %s', async (error) => {
    const { run, eventHandler } = createEventHandler();
    run.mockRejectedValue(error);
    await expect(eventHandler(createS3Event(), { awsRequestId: 'request-1' })).rejects.toBe(error);
  });
});
