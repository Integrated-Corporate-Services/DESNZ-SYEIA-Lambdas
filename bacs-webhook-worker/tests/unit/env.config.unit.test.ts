const ENV_KEYS = [
  'HOST_NAME',
  'DB_HOST',
  'DB_NAME',
  'DB_PORT',
  'DB_CREDENTIALS',
  'PGSSLMODE',
  'SQS_QUEUE_URL',
] as const;

const RDS_HOST = 'eip-dev.cluster-abc123.eu-west-2.rds.amazonaws.com';

async function loadConfig() {
  const { envConfig } = await import('../../src/config/env.config');
  return envConfig.load();
}

describe('envConfig database SSL resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    ENV_KEYS.forEach((key) => delete process.env[key]);
    process.env.DB_CREDENTIALS = JSON.stringify({ username: 'dbadmin', password: 'secret' });
    process.env.DB_NAME = 'icseip';
    process.env.DB_PORT = '5432';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('enables SSL when HOST_NAME points at RDS', async () => {
    process.env.HOST_NAME = RDS_HOST;

    await expect(loadConfig()).resolves.toMatchObject({ dbSsl: true });
  });

  test('disables SSL for local Postgres when HOST_NAME is absent', async () => {
    process.env.DB_HOST = 'localhost';

    await expect(loadConfig()).resolves.toMatchObject({ dbSsl: false });
  });

  test('PGSSLMODE=disable overrides HOST_NAME', async () => {
    process.env.HOST_NAME = RDS_HOST;
    process.env.PGSSLMODE = 'disable';

    await expect(loadConfig()).resolves.toMatchObject({ dbSsl: false });
  });

  test('PGSSLMODE=require enables SSL without HOST_NAME', async () => {
    process.env.DB_HOST = 'localhost';
    process.env.PGSSLMODE = 'require';

    await expect(loadConfig()).resolves.toMatchObject({ dbSsl: true });
  });
});
