import type { Pool } from 'pg';
import { loadConfig } from '../config/migrationPreflight.config';
import { createLogger } from '../logging/migrationPreflight.logger';
import { createDatabasePool } from '../db/migrationDatabase.repository';
import { AwsS3Store, S3Store } from '../aws/migrationS3.repository';
import { AwsWorkflowStarter, WorkflowStarter } from '../aws/migrationWorkflow.repository';
import { BatchRepository } from './migrationBatch.repository';
import { MigrationPreflightService } from './migrationPreflight.service';
import { createMigrationPreflightEventHandler } from '../events/migrationPreflight.eventHandler';

const config = loadConfig();
const logger = createLogger();
let databasePromise: Promise<Pool> | undefined;

function getDatabase(): Promise<Pool> {
  databasePromise ??= createDatabasePool(config).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

export interface MigrationPreflightDependencies {
  s3: S3Store;
  workflow: WorkflowStarter;
  getDb: () => Promise<Pool>;
}

export function createMigrationPreflightHandler(
  dependencies: MigrationPreflightDependencies = {
    s3: new AwsS3Store(),
    workflow: new AwsWorkflowStarter(config.wf1StateMachineArn),
    getDb: getDatabase,
  }
) {
  return createMigrationPreflightEventHandler(config, logger, async (request) => {
    const database = await dependencies.getDb();
    const batches = new BatchRepository(database, config.dbSchema);
    const service = new MigrationPreflightService(
      config,
      dependencies.s3,
      dependencies.workflow,
      batches
    );
    return service.runPreflight(request);
  });
}
