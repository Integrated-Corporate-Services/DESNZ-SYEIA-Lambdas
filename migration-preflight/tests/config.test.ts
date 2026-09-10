import { loadConfig } from '../src/config/config';

describe('loadConfig', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
    delete process.env.MIGRATION_LANDING_BUCKET;
    delete process.env.MIGRATION_STATE_MACHINE_ARN;
    delete process.env.DB_CREDENTIALS;
    delete process.env.HOST_NAME;
    delete process.env.DB_NAME;
    delete process.env.DB_PORT;
    delete process.env.DB_SCHEMA;
    delete process.env.MANIFEST_MAX_BYTES;
    delete process.env.PREFLIGHT_CLAIM_STALE_AFTER_SECONDS;
  });

  it('rejects missing final deployment variables', () => {
    expect(() => loadConfig()).toThrow('MIGRATION_LANDING_BUCKET');
  });

  afterAll(() => {
    process.env = original;
  });

  it('uses the environment variable names provisioned for the migration Lambda', () => {
    process.env.MIGRATION_LANDING_BUCKET = 'test-migration-bucket';
    process.env.MIGRATION_STATE_MACHINE_ARN = 'test-state-machine-arn';
    process.env.DB_CREDENTIALS = 'test-database-secret-arn';
    process.env.HOST_NAME = 'test-database-host';
    process.env.DB_NAME = 'test-database';
    process.env.DB_PORT = '5432';

    expect(loadConfig()).toMatchObject({
      migrationBucket: 'test-migration-bucket',
      wf1StateMachineArn: 'test-state-machine-arn',
      dbSecretArn: 'test-database-secret-arn',
      dbHost: 'test-database-host',
      dbName: 'test-database',
      dbPort: 5432,
    });
  });

  it('rejects non-numeric environment values before they reach the pool', () => {
    process.env.MIGRATION_LANDING_BUCKET = 'test-migration-bucket';
    process.env.MIGRATION_STATE_MACHINE_ARN = 'test-state-machine-arn';
    process.env.DB_CREDENTIALS = 'test-database-secret-arn';
    process.env.HOST_NAME = 'test-database-host';
    process.env.DB_NAME = 'test-database';
    process.env.DB_PORT = 'not-a-port';
    expect(() => loadConfig()).toThrow('Invalid numeric configuration: DB_PORT');
  });

  it('rejects an unsafe DB_SCHEMA identifier', () => {
    process.env.MIGRATION_LANDING_BUCKET = 'test-migration-bucket';
    process.env.MIGRATION_STATE_MACHINE_ARN = 'test-state-machine-arn';
    process.env.DB_CREDENTIALS = 'test-database-secret-arn';
    process.env.HOST_NAME = 'test-database-host';
    process.env.DB_NAME = 'test-database';
    process.env.DB_SCHEMA = 'migration_control;drop table x';
    expect(() => loadConfig()).toThrow('Invalid DB_SCHEMA');
  });
});
