import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';
import { AppConfig } from '../config/config';

interface DatabaseSecret {
  username?: string;
  password?: string;
}

export async function createDatabasePool(
  config: AppConfig,
  secrets = new SecretsManagerClient({})
): Promise<Pool> {
  const connectionString = await readSecret(config, secrets);
  return new Pool({ connectionString, max: 4 });
}

async function readSecret(config: AppConfig, secrets: SecretsManagerClient): Promise<string> {
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: config.dbSecretArn }));
  if (!response.SecretString) throw new Error('Database secret has no SecretString');
  const secret = JSON.parse(response.SecretString) as DatabaseSecret;
  if (!secret.username || !secret.password) {
    throw new Error('DB_CREDENTIALS requires username/password and HOST_NAME/DB_NAME');
  }
  return `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${config.dbHost}:${config.dbPort}/${encodeURIComponent(config.dbName)}?sslmode=require`;
}
