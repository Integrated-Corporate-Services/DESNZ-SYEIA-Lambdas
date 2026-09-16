jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  })),
}));

jest.mock('../../src/config/env.config', () => ({
  envConfig: { get: jest.fn() },
}));

const BASE_CONFIG = {
  dbHost: 'eip-dev.cluster-abc123.eu-west-2.rds.amazonaws.com',
  dbPort: 5432,
  dbUser: 'dbadmin',
  dbPassword: 'secret',
  dbName: 'icseip',
  dbSsl: true,
  sqsQueueUrl: 'https://sqs.eu-west-2.amazonaws.com/000000000000/queue',
  environment: 'dev' as const,
  logLevel: 'info' as const,
};

async function createPoolWith(dbSsl: boolean) {
  jest.resetModules();

  const { envConfig } = await import('../../src/config/env.config');
  (envConfig.get as jest.Mock).mockReturnValue({ ...BASE_CONFIG, dbSsl });

  const { Pool } = await import('pg');
  const { getPool } = await import('../../src/repositories/payment.repository');
  getPool();

  return Pool as unknown as jest.Mock;
}

describe('payment repository pool', () => {
  test('requests TLS when dbSsl is enabled', async () => {
    const Pool = await createPoolWith(true);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });

  test('connects without TLS when dbSsl is disabled', async () => {
    const Pool = await createPoolWith(false);

    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
  });

  test('reuses a single pool across calls', async () => {
    const Pool = await createPoolWith(true);
    const { getPool } = await import('../../src/repositories/payment.repository');
    getPool();

    expect(Pool).toHaveBeenCalledTimes(1);
  });
});
