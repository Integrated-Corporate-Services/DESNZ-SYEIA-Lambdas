import { loadConfig } from '../../../src/config/migrationPreflight.config';
import { createEnvironment } from '../../fixtures/migrationConfig.fixture';

describe('migration configuration', () => {
  let originalEnvironment: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnvironment = process.env;
    process.env = createEnvironment();
  });
  afterEach(() => {
    process.env = originalEnvironment;
  });

  it('maps deployment settings and applies defaults without shell contamination', () => {
    expect(loadConfig()).toMatchObject({
      migrationBucket: 'test-migration-bucket',
      wf1StateMachineArn: 'test-state-machine-arn',
      dbSecretArn: 'test-secret-arn',
      dbHost: 'test-db-host',
      dbName: 'migration_test',
      dbPort: 5432,
      dbSchema: 'migration_control',
      manifestMaxBytes: 1048576,
      staleAfterSeconds: 3600,
      migrationPrefixRoot: 'migrations',
      manifestFilename: 'manifest.json',
    });
  });

  it.each([
    'MIGRATION_LANDING_BUCKET',
    'MIGRATION_STATE_MACHINE_ARN',
    'DB_CREDENTIALS',
    'HOST_NAME',
    'DB_NAME',
  ])('rejects missing %s', (name) => {
    delete process.env[name];
    expect(() => loadConfig()).toThrow(name);
  });

  it.each(['abc', '1.5', '0', '-1', '65536', '9007199254740992'])(
    'rejects invalid DB_PORT=%s',
    (value) => {
      process.env.DB_PORT = value;
      expect(() => loadConfig()).toThrow('DB_PORT');
    }
  );

  it.each(['1', '65535', ' 5433 '])('accepts valid DB_PORT=%s', (value) => {
    process.env.DB_PORT = value;
    expect(loadConfig().dbPort).toBe(Number(value));
  });

  it.each(['MANIFEST_MAX_BYTES', 'PREFLIGHT_CLAIM_STALE_AFTER_SECONDS'])(
    'rejects nonpositive %s',
    (name) => {
      process.env[name] = '0';
      expect(() => loadConfig()).toThrow('must be positive');
    }
  );

  it('rejects schema text that cannot safely be used as an identifier', () => {
    process.env.DB_SCHEMA = 'migration_control;drop table x';
    expect(() => loadConfig()).toThrow('Invalid DB_SCHEMA');
  });

  it('honours explicit prefix, filename and schema settings', () => {
    process.env.MIGRATION_PREFIX_ROOT = 'imports';
    process.env.MANIFEST_FILENAME = 'package.json';
    process.env.DB_SCHEMA = 'migration_test';
    expect(loadConfig()).toMatchObject({
      migrationPrefixRoot: 'imports',
      manifestFilename: 'package.json',
      dbSchema: 'migration_test',
    });
  });
});
