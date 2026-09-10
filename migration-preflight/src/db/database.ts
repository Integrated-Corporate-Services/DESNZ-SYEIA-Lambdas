import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';
import { AppConfig } from '../config/config';

interface DatabaseSecret {
  username?: string;
  password?: string;
}

export type PoolSslOption = false | { rejectUnauthorized: boolean };

/**
 * TLS for the RDS pool.
 * - local compose: no TLS
 * - DB_SSL_REJECT_UNAUTHORIZED=false: encrypt but do not verify (explicit opt-out)
 * - DB_SSL_REJECT_UNAUTHORIZED=true: encrypt and verify
 * - NODE_ENV=development (EIP-dev): same opt-out as the other SYEIA Lambdas until a CA is supplied
 * - otherwise: verify the certificate
 */
export function poolSslOption(
  nodeEnv = process.env.NODE_ENV,
  rejectUnauthorizedEnv = process.env.DB_SSL_REJECT_UNAUTHORIZED
): PoolSslOption {
  if (nodeEnv === 'local') return false;
  if (rejectUnauthorizedEnv === 'false') return { rejectUnauthorized: false };
  if (rejectUnauthorizedEnv === 'true') return { rejectUnauthorized: true };
  if (nodeEnv === 'development') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
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
    throw new Error('DB_CREDENTIALS secret must contain username and password');
  }
  return { username: secret.username, password: secret.password };
}
