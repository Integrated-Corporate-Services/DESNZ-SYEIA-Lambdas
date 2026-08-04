/**
 * Environment Configuration
 * Centralizes all environment variable access
 */

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/** Map AWS Dev env names onto the names this Lambda already expects. */
function applyEnvAliases(): void {
  if (!process.env.AWS_REGION && process.env.REGION) {
    process.env.AWS_REGION = process.env.REGION;
  }
  if (!process.env.NOTIFY_FATAL_QUEUE_URL && process.env.SQS_DLQ_URL) {
    process.env.NOTIFY_FATAL_QUEUE_URL = process.env.SQS_DLQ_URL;
  }
}

applyEnvAliases();

export const AWS_CONFIG = {
  region: process.env.AWS_REGION ?? 'eu-west-2',
  endpoint: process.env.AWS_ENDPOINT,
};

export const FATAL_QUEUE_URL = process.env.NOTIFY_FATAL_QUEUE_URL ?? '';

export function validateEnvironment(): void {
  applyEnvAliases();

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasHostDb =
    Boolean(process.env.HOST_NAME || process.env.DB_HOST) &&
    Boolean(process.env.DB_NAME) &&
    Boolean(process.env.DB_CREDENTIALS);

  if (!hasDatabaseUrl && !hasHostDb) {
    throw new Error(
      'Missing database config: set DATABASE_URL or HOST_NAME + DB_NAME + DB_CREDENTIALS',
    );
  }
}

async function resolveDbCredentials(): Promise<{ username: string; password: string }> {
  const raw = process.env.DB_CREDENTIALS?.trim();
  if (!raw) {
    throw new Error('Missing DB_CREDENTIALS');
  }

  if (raw.startsWith('arn:aws:secretsmanager:')) {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || process.env.REGION || 'eu-west-2',
    });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: raw }),
    );
    const payload = response.SecretString;
    if (!payload) {
      throw new Error('Secrets Manager secret has no SecretString');
    }
    const parsed = JSON.parse(payload) as { username?: string; password?: string };
    if (!parsed.username || !parsed.password) {
      throw new Error("Secret JSON must contain 'username' and 'password'");
    }
    return { username: parsed.username, password: parsed.password };
  }

  const parsed = JSON.parse(raw) as { username?: string; password?: string };
  if (!parsed.username || !parsed.password) {
    throw new Error("DB_CREDENTIALS JSON must contain 'username' and 'password'");
  }
  return { username: parsed.username, password: parsed.password };
}

export async function resolveConnectionString(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.HOST_NAME || process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const port = process.env.DB_PORT || '5432';
  if (!host || !database) {
    throw new Error('HOST_NAME/DB_HOST and DB_NAME are required when DATABASE_URL is not set');
  }

  const { username, password } = await resolveDbCredentials();
  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function shouldUseDbSsl(): boolean {
  return Boolean(process.env.HOST_NAME) && process.env.PGSSLMODE !== 'disable';
}
