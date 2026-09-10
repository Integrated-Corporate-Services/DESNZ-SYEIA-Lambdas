import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';
import { AppConfig } from '../config/config';

interface DatabaseSecret {
  username?: string;
  password?: string;
}

export function poolSslOption(
  nodeEnv = process.env.NODE_ENV
): false | { rejectUnauthorized: false } {
  if (nodeEnv === 'local') return false;
  return { rejectUnauthorized: false };
}

export async function createDatabasePool(
  config: AppConfig,
  secrets = new SecretsManagerClient({})
): Promise<Pool> {
  const credentials = await readSecret(config, secrets);
  return new Pool({
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    user: credentials.username,
    password: credentials.password,
    max: 4,
    ssl: poolSslOption(),
  });
}

async function readSecret(
  config: AppConfig,
  secrets: SecretsManagerClient
): Promise<{ username: string; password: string }> {
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: config.dbSecretArn }));
  if (!response.SecretString) throw new Error('Database secret has no SecretString');
  const secret = JSON.parse(response.SecretString) as DatabaseSecret;
  if (!secret.username || !secret.password) {
    throw new Error('DB_CREDENTIALS requires username/password and HOST_NAME/DB_NAME');
  }
  return { username: secret.username, password: secret.password };
}
