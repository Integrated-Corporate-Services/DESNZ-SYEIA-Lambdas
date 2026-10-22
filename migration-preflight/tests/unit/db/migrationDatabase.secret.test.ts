import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createDatabasePool } from '../../../src/db/migrationDatabase.connection';
import { createConfig } from '../../fixtures/migrationConfig.fixture';

describe('database secret validation (no database connection)', () => {
  it.each([
    [{}, 'no SecretString'],
    [{ SecretString: '{}' }, 'username and password'],
    [{ SecretString: '{"username":"test-user"}' }, 'username and password'],
    [{ SecretString: '{"password":"test-only"}' }, 'username and password'],
  ])('rejects incomplete secret %j', async (response, message) => {
    const client = new SecretsManagerClient({
      region: 'eu-west-2',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const send = jest.fn().mockResolvedValue(response);
    client.send = send;
    try {
      await expect(createDatabasePool(createConfig(), client)).rejects.toThrow(message as string);
      expect(send).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
      expect(send.mock.calls[0][0].input).toEqual({ SecretId: 'test-secret-arn' });
    } finally {
      client.destroy();
    }
  });
});
