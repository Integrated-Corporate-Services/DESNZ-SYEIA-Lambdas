import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// Database configuration helpers mirrored in pay-callback-relay (independent Lambda zip bundles).

interface DbCredentials {
  username: string;
  password: string;
}

let cachedCredentials: DbCredentials | null = null;

export function resetDbConfigCache(): void {
  cachedCredentials = null;
}

export function getDbHost(): string {
  return process.env.HOST_NAME || '';
}

export function getDbPort(): number {
  const port = Number(process.env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid database port: ${process.env.DB_PORT}`);
  }

  return port;
}

export function getDbName(): string {
  return process.env.DB_NAME || '';
}

export function getAwsRegion(): string {
  return process.env.REGION || 'eu-west-2';
}

export function hasDbCredentialsConfigured(): boolean {
  return Boolean(process.env.DB_CREDENTIALS?.trim());
}

export function shouldUseDbSsl(): boolean {
  // Always use SSL for RDS connections (HOST_NAME indicates RDS)
  return Boolean(process.env.HOST_NAME);
}

async function fetchSecretFromArn(secretArn: string): Promise<DbCredentials> {
  const client = new SecretsManagerClient({
    region: getAwsRegion(),
  });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));

  const payload = response.SecretString
    ?? (response.SecretBinary ? Buffer.from(response.SecretBinary as Uint8Array).toString('utf8') : undefined);

  if (!payload) {
    throw new Error('Secrets Manager secret has no SecretString or SecretBinary payload.');
  }
  const parsed = JSON.parse(payload) as DbCredentials;
  if (!parsed.username || !parsed.password) {
    throw new Error("Secret JSON must contain 'username' and 'password'.");
  }

  return parsed;
}

export async function resolveDbCredentials(): Promise<DbCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const dbCredentials = process.env.DB_CREDENTIALS?.trim();
  if (!dbCredentials) {
    throw new Error('DB_CREDENTIALS environment variable is required.');
  }

  if (dbCredentials.startsWith('arn:aws:secretsmanager:')) {
    cachedCredentials = await fetchSecretFromArn(dbCredentials);
    return cachedCredentials;
  }

  throw new Error('DB_CREDENTIALS must be a valid Secrets Manager ARN (e.g., arn:aws:secretsmanager:...).');
}
