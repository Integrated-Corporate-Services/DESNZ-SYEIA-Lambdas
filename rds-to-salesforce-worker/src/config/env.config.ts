import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export const AWS_CONFIG = {
  region: process.env.REGION ?? process.env.AWS_REGION ?? 'eu-west-2',
  endpoint: process.env.AWS_ENDPOINT,
};

export async function getConfigValue(param: string | undefined, region: string = AWS_CONFIG.region): Promise<string> {
  if (param && param.startsWith('arn:aws:ssm:')) {
    const ssm = new SSMClient({ region });
    const response = await ssm.send(new GetParameterCommand({ Name: param, WithDecryption: true }));
    return response.Parameter?.Value ?? '';
  }
  return param ?? '';
}

interface DbSecret {
  username: string;
  password: string;
  host?: string;
  port?: number;
  dbname?: string;
}

let cachedDbSecret: { value: DbSecret; fetchedAt: number } | undefined;
const DB_SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS || 10 * 60 * 1000);

async function getDbSecret(): Promise<DbSecret> {
  const secretArn = process.env.DB_CREDENTIALS;
  if (!secretArn) {
    throw new Error('Missing env var DB_CREDENTIALS (Secrets Manager secret ARN)');
  }
  if (cachedDbSecret && Date.now() - cachedDbSecret.fetchedAt < DB_SECRET_TTL_MS) {
    return cachedDbSecret.value;
  }
  const client = new SecretsManagerClient({ region: AWS_CONFIG.region });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!response.SecretString) {
    throw new Error('DB_CREDENTIALS secret has no SecretString');
  }
  const parsed = JSON.parse(response.SecretString) as DbSecret;
  if (!parsed.username || !parsed.password) {
    throw new Error("DB_CREDENTIALS secret JSON must contain 'username' and 'password'");
  }
  cachedDbSecret = { value: parsed, fetchedAt: Date.now() };
  return parsed;
}

export async function getDatabaseConfig() {
  const secret = await getDbSecret();
  const isLocal = process.env.NODE_ENV === 'local';
  return {
    host: secret.host || process.env.HOST_NAME,
    port: Number(secret.port || process.env.DB_PORT || 5432),
    database: secret.dbname || process.env.DB_NAME,
    user: secret.username,
    password: secret.password,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DB_CONN_MS || 5000),
    ssl: isLocal ? false : { require: true, rejectUnauthorized: false },
    keepAlive: true,
    application_name: process.env.APP_NAME || 'rds-to-salesforce-worker',
  };
}

export async function getSalesforceConfig() {
  return {
    authMode: await getConfigValue(process.env.SALESFORCE_AUTH_MODE),
    baseUrl: await getConfigValue(process.env.SALESFORCE_BASE_URL),
    clientId: await getConfigValue(process.env.SALESFORCE_CLIENT_ID),
    clientSecret: await getConfigValue(process.env.SALESFORCE_CLIENT_SECRET),
    objectApi: await getConfigValue(process.env.SALESFORCE_OBJECT_API),
    tokenUrl: await getConfigValue(process.env.SALESFORCE_TOKEN_URL),
    accessToken: process.env.SALESFORCE_ACCESS_TOKEN,
    httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 30000),
  };
}

let cachedMaxRetries: { value: number; fetchedAt: number } | undefined;
const MAX_RETRIES_TTL_MS = Number(process.env.MAX_RETRIES_TTL_MS || 60000);

export async function getMaxRetries(): Promise<number> {
  if (cachedMaxRetries && Date.now() - cachedMaxRetries.fetchedAt < MAX_RETRIES_TTL_MS) {
    return cachedMaxRetries.value;
  }
  const raw = await getConfigValue(process.env.MAX_RETRIES);
  const value = Number(raw) || 5;
  cachedMaxRetries = { value, fetchedAt: Date.now() };
  return value;
}

export const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL ?? '';
export const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN ?? '';
export const SQS_DLQ_URL = process.env.SQS_DLQ_URL ?? '';
export const SQS_DLQ_ARN = process.env.SQS_DLQ_ARN ?? '';

export function validateEnvironment(): void {
  const required = [
    'DB_CREDENTIALS',
    'HOST_NAME',
    'DB_NAME',
    'SALESFORCE_AUTH_MODE',
    'SALESFORCE_BASE_URL',
    'SALESFORCE_OBJECT_API',
    'SQS_QUEUE_URL',
    'SQS_QUEUE_ARN',
    'SQS_DLQ_URL',
    'SQS_DLQ_ARN',
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
