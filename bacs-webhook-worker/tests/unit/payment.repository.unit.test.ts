jest.mock('pg', () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  const pool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue(client),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => pool), __client: client };
});

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

async function loadRepository(dbSsl = true) {
  jest.resetModules();

  const { envConfig } = await import('../../src/config/env.config');
  (envConfig.get as jest.Mock).mockReturnValue({ ...BASE_CONFIG, dbSsl });

  const pg = (await import('pg')) as unknown as { Pool: jest.Mock; __client: { query: jest.Mock; release: jest.Mock } };
  const repository = await import('../../src/repositories/payment.repository');

  return { pg, ...repository };
}

describe('payment repository pool', () => {
  test('requests TLS when dbSsl is enabled', async () => {
    const { pg, getPool } = await loadRepository(true);
    getPool();

    expect(pg.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: false } }),
    );
  });

  test('connects without TLS when dbSsl is disabled', async () => {
    const { pg, getPool } = await loadRepository(false);
    getPool();

    expect(pg.Pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
  });

  test('reuses a single pool across calls', async () => {
    const { pg, getPool } = await loadRepository();
    getPool();
    getPool();

    expect(pg.Pool).toHaveBeenCalledTimes(1);
  });
});

describe('updatePaymentStatus', () => {
  test('updates payment.status by application_id and releases the client', async () => {
    const { pg, paymentRepository } = await loadRepository();
    pg.__client.query.mockResolvedValue({
      rows: [{ id: 42, application_id: 'app-1', status: 'completed' }],
    });

    const updated = await paymentRepository.updatePaymentStatus('app-1', 'completed');

    expect(updated).toEqual({ id: 42, applicationId: 'app-1', status: 'completed' });
    const [sql, params] = pg.__client.query.mock.calls[0];
    expect(sql).toContain('UPDATE payment');
    expect(sql).toContain('WHERE application_id = $1');
    expect(sql).toContain("LOWER(provider) = 'bacs'");
    expect(sql).not.toContain('WHERE id =');
    expect(sql).not.toContain('ORDER BY id DESC');
    expect(sql).not.toContain('updated_at');
    expect(params).toEqual(['app-1', 'completed']);
    expect(pg.__client.release).toHaveBeenCalled();
  });
});
