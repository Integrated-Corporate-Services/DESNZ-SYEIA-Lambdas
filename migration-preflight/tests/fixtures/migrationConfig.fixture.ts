import type { AppConfig } from '../../src/types/migrationConfig.types';

export function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    migrationBucket: 'test-migration-bucket',
    wf1StateMachineArn: 'test-state-machine-arn',
    dbSecretArn: 'test-secret-arn',
    dbHost: 'test-db-host',
    dbPort: 5432,
    dbName: 'migration_test',
    migrationPrefixRoot: 'migrations',
    manifestFilename: 'manifest.json',
    manifestMaxBytes: 4096,
    staleAfterSeconds: 3600,
    dbSchema: 'migration_control',
    ...overrides,
  };
}

export function createEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    MIGRATION_LANDING_BUCKET: 'test-migration-bucket',
    MIGRATION_STATE_MACHINE_ARN: 'test-state-machine-arn',
    DB_CREDENTIALS: 'test-secret-arn',
    HOST_NAME: 'test-db-host',
    DB_NAME: 'migration_test',
  };
}

export function createWorkflowConfig() {
  return {
    ecsClusterArn: 'test-cluster',
    runtimeTaskDefinitionArn: 'test-task',
    runtimeContainerName: 'migration',
    approvalHandlerArn: 'test-approval',
    networkConfiguration: { awsvpcConfiguration: { subnets: ['test-subnet'] } },
  };
}
