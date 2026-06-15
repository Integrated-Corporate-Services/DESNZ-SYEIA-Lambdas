import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// Database configuration helpers mirrored in pay-callback-reconciler (independent Lambda zip bundles).

interface DbCredentials {
  username: string;
  password: string;
}

let cachedCredentials: DbCredentials | null = null;

export function resetDbConfigCache(): void {
  cachedCredentials = null;
}

export function getDbHost(): string {
  return process.env.PGHOST || process.env.DB_HOST || process.env.HOST_NAME || '';
}

export function getDbPort(): number {
  const port = Number(process.env.PGPORT || process.env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid database port: ${process.env.PGPORT || process.env.DB_PORT}`);
  }

  return port;
}

export function getDbName(): string {
  return process.env.PGDATABASE || process.env.DB_NAME || '';
}

export function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.REGION || 'eu-west-2';
}

export function hasDbCredentialsConfigured(): boolean {
  if (process.env.DB_CREDENTIALS?.trim()) {
    return true;
  }

  const username = process.env.PGUSER || process.env.DB_USER;
  const password = process.env.PGPASSWORD || process.env.DB_PASSWORD;
  return Boolean(username && password);
}

export function shouldUseDbSsl(): boolean {
  if (process.env.PGSSLMODE === 'disable') {
    return false;
  }

  if (process.env.PGSSLMODE === 'require') {
    return true;
  }

  return Boolean(process.env.HOST_NAME);
}

async function fetchSecretFromArn(secretArn: string): Promise<DbCredentials> {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const client = new SecretsManagerClient({
    region: getAwsRegion(),
    ...(endpoint ? { endpoint } : {}),
  });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));

  const payload = response.SecretString
    ?? Buffer.from(response.SecretBinary as Uint8Array).toString('utf8');

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
  if (dbCredentials) {
    if (dbCredentials.startsWith('arn:aws:secretsmanager:')) {
      cachedCredentials = await fetchSecretFromArn(dbCredentials);
      return cachedCredentials;
    }

    try {
      const parsed = JSON.parse(dbCredentials) as DbCredentials;
      if (parsed.username && parsed.password) {
        cachedCredentials = parsed;
        return parsed;
      }

      throw new Error("DB_CREDENTIALS JSON must contain 'username' and 'password'.");
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(
          'DB_CREDENTIALS must be a Secrets Manager ARN or valid JSON with username and password.'
        );
      }

      throw err;
    }
  }

  const username = process.env.PGUSER || process.env.DB_USER;
  const password = process.env.PGPASSWORD || process.env.DB_PASSWORD;
  if (!username || !password) {
    throw new Error('DB credentials not found. Provide DB_CREDENTIALS or PGUSER/PGPASSWORD.');
  }

  cachedCredentials = { username, password };
  return cachedCredentials;
}
