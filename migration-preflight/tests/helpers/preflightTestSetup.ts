import type { S3Store } from '../../src/aws/migrationS3.repository';
import type { WorkflowStarter } from '../../src/aws/migrationWorkflow.repository';
import type { BatchRepository } from '../../src/migration-control/migrationBatch.repository';
import { MigrationPreflightService } from '../../src/migration-control/migrationPreflight.service';
import { createConfig } from '../fixtures/migrationConfig.fixture';
import { createRequest } from '../fixtures/migrationEvent.fixture';
import { createManifest } from '../fixtures/migrationManifest.fixture';

type BatchStore = Pick<
  BatchRepository,
  'admit' | 'get' | 'markValidated' | 'markStarted' | 'recordFailure'
>;

export function createPreflightTestSetup() {
  const config = createConfig();
  const request = createRequest();
  const manifest = createManifest();
  const s3: jest.Mocked<S3Store> = { getText: jest.fn(), head: jest.fn() };
  s3.getText.mockResolvedValue(JSON.stringify(manifest));
  s3.head.mockImplementation(async (_bucket, key) => {
    const file = [manifest.casesFile, ...manifest.documents].find((item) => item.key === key);
    if (!file) throw new Error('Unconfigured file in test: ' + key);
    return { size: file.sizeBytes, checksum: file.checksum };
  });
  const workflow: jest.Mocked<WorkflowStarter> = { start: jest.fn() };
  workflow.start.mockResolvedValue('arn:execution');
  const batches: jest.Mocked<BatchStore> = {
    admit: jest.fn(),
    get: jest.fn(),
    markValidated: jest.fn(),
    markStarted: jest.fn(),
    recordFailure: jest.fn(),
  };
  batches.admit.mockResolvedValue({
    migration_batch_id: manifest.migrationBatchId,
    preflight_status: 'PREFLIGHT_IN_PROGRESS',
    step_function_execution_arn: null,
  });
  batches.markValidated.mockResolvedValue(true);
  batches.markStarted.mockResolvedValue(true);
  batches.recordFailure.mockResolvedValue(undefined);
  batches.get.mockResolvedValue(null);
  const service = new MigrationPreflightService(config, s3, workflow, batches);
  return { config, request, manifest, s3, workflow, batches, service };
}
