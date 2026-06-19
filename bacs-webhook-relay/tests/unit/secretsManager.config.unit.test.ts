jest.mock('@aws-sdk/client-secrets-manager');

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { secretsManagerConfig } from '../../src/config/secretsManager.config';
import { envConfig } from '../../src/config/env.config';

const MockedClient = SecretsManagerClient as jest.MockedClass<typeof SecretsManagerClient>;

beforeEach(() => {
  secretsManagerConfig.resetForTest();
  envConfig.resetForTest();
  process.env.AWS_REGION = 'eu-west-2';
  process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:eu-west-2:111:secret:rds';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'appdb';
  process.env.BACS_WEBHOOK_RELAY_BATCH_SIZE_PARAM = '/bacs-webhook-relay/batch-size';
  process.env.PARTNER_WEBHOOKS_QUEUE_URL = 'http://main';
  process.env.PARTNER_WEBHOOKS_DLQ_URL = 'http://dlq';
  process.env.SECRET_CACHE_TTL_MS = '60000';
});

describe('SecretsManagerConfig', () => {
  it('fetches credentials and caches them for the warm container', async () => {
    const send = jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({ username: 'app_user', password: 'p1' }),
      VersionId: 'rotation-v1',
    });
    MockedClient.mockImplementation(() => ({ send } as unknown as SecretsManagerClient));

    const a = await secretsManagerConfig.getRdsCredentials();
    const b = await secretsManagerConfig.getRdsCredentials();

    expect(a.username).toBe('app_user');
    expect(a.password).toBe('p1');
    expect(a.rotationVersionId).toBe('rotation-v1');
    expect(b).toBe(a);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetSecretValueCommand);
  });

  it('re-fetches after invalidateCache() (simulating Secrets Manager rotation)', async () => {
    const send = jest.fn()
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ username: 'u', password: 'old' }), VersionId: 'v1' })
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ username: 'u', password: 'new' }), VersionId: 'v2' });
    MockedClient.mockImplementation(() => ({ send } as unknown as SecretsManagerClient));

    const before = await secretsManagerConfig.getRdsCredentials();
    expect(before.password).toBe('old');

    secretsManagerConfig.invalidateCache();

    const after = await secretsManagerConfig.getRdsCredentials();
    expect(after.password).toBe('new');
    expect(after.rotationVersionId).toBe('v2');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent fetches into a single in-flight request', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => { resolve = r; });
    const send = jest.fn().mockReturnValue(pending);
    MockedClient.mockImplementation(() => ({ send } as unknown as SecretsManagerClient));

    const a = secretsManagerConfig.getRdsCredentials();
    const b = secretsManagerConfig.getRdsCredentials();

    resolve({ SecretString: JSON.stringify({ username: 'u', password: 'p' }), VersionId: 'v1' });
    await Promise.all([a, b]);

    expect(send).toHaveBeenCalledTimes(1);
  });
});
