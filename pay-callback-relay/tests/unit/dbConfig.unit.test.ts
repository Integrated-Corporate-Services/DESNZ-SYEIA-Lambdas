import {
  getDbHost,
  getDbName,
  getDbPort,
  hasDbCredentialsConfigured,
  resolveDbCredentials,
  resetDbConfigCache,
  shouldUseDbSsl,
} from '../../src/util/dbConfig';

describe('dbConfig', () => {
  const originalEnv = process.env;

  const dbEnvKeys = [
    'PGHOST',
    'DB_HOST',
    'HOST_NAME',
    'PGUSER',
    'DB_USER',
    'PGPASSWORD',
    'DB_PASSWORD',
    'PGDATABASE',
    'DB_NAME',
    'DB_PORT',
    'PGPORT',
    'DB_CREDENTIALS',
  ] as const;

  function clearDbEnvVars(): void {
    dbEnvKeys.forEach((key) => {
      delete process.env[key];
    });
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearDbEnvVars();
    resetDbConfigCache();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('resolves host from AWS and local env names', () => {
    process.env.HOST_NAME = 'rds.example.com';
    expect(getDbHost()).toBe('rds.example.com');

    delete process.env.HOST_NAME;
    process.env.DB_HOST = 'localhost';
    expect(getDbHost()).toBe('localhost');
  });

  test('validates database port range', () => {
    process.env.DB_PORT = '5434';
    expect(getDbPort()).toBe(5434);

    process.env.DB_PORT = '0';
    expect(() => getDbPort()).toThrow('Invalid database port');
  });

  test('detects configured credentials', () => {
    delete process.env.DB_CREDENTIALS;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    expect(hasDbCredentialsConfigured()).toBe(false);

    process.env.DB_CREDENTIALS = '   ';
    expect(hasDbCredentialsConfigured()).toBe(false);

    process.env.DB_CREDENTIALS = '{"username":"u","password":"p"}';
    expect(hasDbCredentialsConfigured()).toBe(true);
  });

  test('parses inline DB_CREDENTIALS JSON', async () => {
    process.env.DB_CREDENTIALS = '{"username":"db-user","password":"db-pass"}';

    await expect(resolveDbCredentials()).resolves.toEqual({
      username: 'db-user',
      password: 'db-pass',
    });
  });

  test('rejects invalid DB_CREDENTIALS JSON', async () => {
    process.env.DB_CREDENTIALS = 'not-json';

    await expect(resolveDbCredentials()).rejects.toThrow(
      'DB_CREDENTIALS must be a Secrets Manager ARN or valid JSON with username and password.'
    );
  });

  test('derives SSL from HOST_NAME and PGSSLMODE', () => {
    delete process.env.PGSSLMODE;
    delete process.env.HOST_NAME;
    expect(shouldUseDbSsl()).toBe(false);

    process.env.HOST_NAME = 'rds.example.com';
    expect(shouldUseDbSsl()).toBe(true);

    process.env.PGSSLMODE = 'disable';
    expect(shouldUseDbSsl()).toBe(false);
  });

  test('resolves database name from DB_NAME or PGDATABASE', () => {
    process.env.DB_NAME = 'appdb';
    expect(getDbName()).toBe('appdb');
  });
});
