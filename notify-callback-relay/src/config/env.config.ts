/**
 * Environment Configuration
 * Centralizes all environment variable access
 */

import { Pool } from 'pg';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/** Map AWS Dev env names onto the names this Lambda already expects. */
function applyEnvAliases(): void {
  if (!process.env.AWS_REGION && process.env.REGION) {
    process.env.AWS_REGION = process.env.REGION;
  }
}

applyEnvAliases();

export const RELAY_BATCH_SIZE = parseInt(
  process.env.NOTIFY_RELAY_BATCH_SIZE || '50',
  10,
);

export const AWS_CONFIG = {
  region: process.env.AWS_REGION ?? 'eu-west-2',
  endpoint: process.env.AWS_ENDPOINT,
};

export const QUEUE_URL = process.env.SQS_QUEUE_URL ?? '';

export function validateEnvironment(): void {
  applyEnvAliases();

  const hasHostDb =
    Boolean(process.env.HOST_NAME) &&
    Boolean(process.env.DB_NAME) &&
    Boolean(process.env.DB_CREDENTIALS);

  if (!hasHostDb) {
    throw new Error(
      'Missing database config: set HOST_NAME + DB_NAME + DB_CREDENTIALS',
    );
  }

  if (!process.env.SQS_QUEUE_URL) {
    throw new Error(
      'Missing required environment variables: SQS_QUEUE_URL',
    );
  }
}

let cachedCredentials: { username: string; password: string } | null = null;
let cachedConnectionString: string | null = null;
let cachedPool: Pool | null = null;
let poolInitPromise: Promise<Pool> | null = null;

async function resolveDbCredentials(): Promise<{ username: string; password: string }> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

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
    const payload =
      response.SecretString ??
      (response.SecretBinary
        ? Buffer.from(response.SecretBinary as Uint8Array).toString('utf8')
        : undefined);
    if (!payload) {
      throw new Error('Secrets Manager secret has no SecretString or SecretBinary');
    }
    const parsed = JSON.parse(payload) as { username?: string; password?: string };
    if (!parsed.username || !parsed.password) {
      throw new Error("Secret JSON must contain 'username' and 'password'");
    }
    cachedCredentials = { username: parsed.username, password: parsed.password };
    return cachedCredentials;
  }

  const parsed = JSON.parse(raw) as { username?: string; password?: string };
  if (!parsed.username || !parsed.password) {
    throw new Error("DB_CREDENTIALS JSON must contain 'username' and 'password'");
  }
  cachedCredentials = { username: parsed.username, password: parsed.password };
  return cachedCredentials;
}

/** Build a Postgres connection string for Pool (supports AWS Dev HOST_NAME + secret ARN). */
export async function resolveConnectionString(): Promise<string> {
  if (cachedConnectionString) {
    return cachedConnectionString;
  }

  const host = process.env.HOST_NAME;
  const database = process.env.DB_NAME;
  const port = process.env.DB_PORT || '5432';
  if (!host || !database) {
    throw new Error('HOST_NAME and DB_NAME are required');
  }

  const { username, password } = await resolveDbCredentials();
  cachedConnectionString = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  return cachedConnectionString;
}

export function shouldUseDbSsl(): boolean {
  return Boolean(process.env.HOST_NAME);
}

/** Reuse one Pool across warm Lambda invocations. */
export async function getPool(): Promise<Pool> {
  if (cachedPool) {
    return cachedPool;
  }

  if (!poolInitPromise) {
    poolInitPromise = (async () => {
      const connectionString = await resolveConnectionString();
      cachedPool = new Pool({
        connectionString,
        max: parseInt(process.env.DB_POOL_MAX || '5', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: shouldUseDbSsl() ? { rejectUnauthorized: false } : undefined,
      });
      return cachedPool;
    })();
  }

  try {
    return await poolInitPromise;
  } catch (error) {
    poolInitPromise = null;
    throw error;
  }
}
