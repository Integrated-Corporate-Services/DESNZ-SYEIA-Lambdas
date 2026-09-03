import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';
import { AppConfig } from '../config/config';

interface DatabaseSecret {
  connectionString?: string;
  DATABASE_URL?: string;
}

export async function createDatabasePool(
  config: AppConfig,
  secrets = new SecretsManagerClient({})
): Promise<Pool> {
  const connectionString = config.databaseUrl ?? (await readSecret(config.dbSecretArn, secrets));
  if (!connectionString) {
    throw new Error('Missing required configuration: DATABASE_URL or DB_SECRET_ARN');
  }
  return new Pool({ connectionString, max: 4 });
}

async function readSecret(
  arn: string | undefined,
  secrets: SecretsManagerClient
): Promise<string | undefined> {
  if (!arn) return undefined;
  const response = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!response.SecretString) throw new Error('Database secret has no SecretString');
  const secret = JSON.parse(response.SecretString) as DatabaseSecret;
  return secret.connectionString ?? secret.DATABASE_URL;
}
