import pino from 'pino';
import {
  createMigrationPreflightController,
  RunMigrationPreflight,
} from '../../../src/events/migrationPreflight.controller';
import { MigrationError } from '../../../src/errors/migrationPreflight.error';
import { createConfig } from '../../fixtures/migrationConfig.fixture';
import { createS3Event } from '../../fixtures/migrationEvent.fixture';

function createController() {
  const run: jest.MockedFunction<RunMigrationPreflight> = jest.fn();
  const controller = createMigrationPreflightController(
    createConfig(),
    pino({ enabled: false }),
    run
  );
  return { run, controller };
}

describe('Lambda event/response boundary', () => {
  it('skips an unsupported event without invoking the use case', async () => {
    const { run, controller } = createController();
    await expect(controller(null, { awsRequestId: 'request-1' })).resolves.toMatchObject({
      outcome: 'SKIPPED',
      failureCode: 'UNSUPPORTED_EVENT',
      correlationId: 'request-1',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the normalised request and returns the use-case result', async () => {
    const { run, controller } = createController();
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
    await expect(controller(createS3Event(), { awsRequestId: 'request-1' })).resolves.toEqual(
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
    const { run, controller } = createController();
    run.mockRejectedValue(new MigrationError('INVALID_MANIFEST', 'bad manifest'));
    await expect(controller(createS3Event(), { awsRequestId: 'request-1' })).resolves.toMatchObject(
      {
        outcome: 'PREFLIGHT_FAILED',
        migrationBatchId: null,
        preflightStatus: null,
        failureCode: 'INVALID_MANIFEST',
        failureReason: 'bad manifest',
      }
    );
  });

  it.each([
    new MigrationError('MANIFEST_NOT_FOUND', 'not uploaded yet', true),
    new Error('database unavailable'),
  ])('rethrows retryable/infrastructure failures: %s', async (error) => {
    const { run, controller } = createController();
    run.mockRejectedValue(error);
    await expect(controller(createS3Event(), { awsRequestId: 'request-1' })).rejects.toBe(error);
  });
});
