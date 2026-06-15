import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

interface DbCredentials {
  username: string;
  password: string;
}

let cachedCredentials: DbCredentials | null = null;

export function getDbHost(): string {
  return process.env.DB_HOST || process.env.HOST_NAME || process.env.PGHOST || '';
}

export function getDbPort(): number {
  return Number(process.env.DB_PORT || process.env.PGPORT || 5432);
}

export function getDbName(): string {
  return process.env.DB_NAME || process.env.PGDATABASE || '';
}

export function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.REGION || 'eu-west-2';
}

export function hasDbCredentialsConfigured(): boolean {
  if (process.env.DB_CREDENTIALS) {
    return true;
  }

  const username = process.env.DB_USER || process.env.PGUSER;
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD;
  return Boolean(username && password);
}

export function shouldUseDbSsl(): boolean {
  if (process.env.PGSSLMODE === 'disable') {
    return false;
  }

  if (process.env.PGSSLMODE === 'require') {
    return true;
  }

  return Boolean(process.env.HOST_NAME || process.env.DB_CREDENTIALS);
}

async function fetchSecretFromArn(secretArn: string): Promise<DbCredentials> {
  const client = new SecretsManagerClient({ region: getAwsRegion() });
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

  const dbCredentials = process.env.DB_CREDENTIALS;
  if (dbCredentials) {
    try {
      const parsed = JSON.parse(dbCredentials) as DbCredentials;
      if (parsed.username && parsed.password) {
        cachedCredentials = parsed;
        return parsed;
      }
    } catch {
      if (dbCredentials.startsWith('arn:aws:secretsmanager:')) {
        cachedCredentials = await fetchSecretFromArn(dbCredentials);
        return cachedCredentials;
      }
    }
  }

  const username = process.env.DB_USER || process.env.PGUSER;
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD;
  if (!username || !password) {
    throw new Error('DB credentials not found. Provide DB_CREDENTIALS or DB_USER/DB_PASSWORD.');
  }

  cachedCredentials = { username, password };
  return cachedCredentials;
}
