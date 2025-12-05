import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

/**
 * Fetches a config value from SSM Parameter Store if the input is an ARN, otherwise returns the value directly.
 * @param {string} param - Either the config value or an SSM parameter ARN.
 * @param {string} [region] - AWS region (optional, defaults to process.env.REGION)
 * @returns {Promise<string>} The resolved config value
 */
export async function getConfigValue(param, region = process.env.REGION) {
  if (param && param.startsWith("arn:aws:ssm:")) {
    const ssm = new SSMClient({ region });
    const command = new GetParameterCommand({ Name: param, WithDecryption: true });
    const response = await ssm.send(command);
    return response.Parameter.Value;
  }
  return param;
}


/**
 * Fetches and parses a secret from AWS Secrets Manager.
 * @param {string} secretArn - The ARN or name of the secret.
 * @param {string} [region] - AWS region (optional, defaults to process.env.REGION)
 * @returns {Promise<object>} The parsed secret value (JSON)
 */
export async function getSecretConfig(secretArn, region = process.env.REGION) {
  if (!secretArn) {
    throw new Error("Missing secret ARN or name.");
  }
  const secretsClient = new SecretsManagerClient({ region });
  const cmd = new GetSecretValueCommand({ SecretId: secretArn });
  const res = await secretsClient.send(cmd);
  let payload;
  if (res.SecretString) {
    payload = res.SecretString;
  } else if (res.SecretBinary) {
    log.error("Secret has no SecretString or SecretBinary.");
    payload = Buffer.from(res.SecretBinary, "base64").toString("utf8");
  } else {
    log.error("Secret has no SecretString or SecretBinary.");
    throw new Error("Secret has no SecretString or SecretBinary.");
  }
  try {
    return JSON.parse(payload);
  } catch {
    log.error("SecretString is not valid JSON.");
    throw new Error("SecretString is not valid JSON.");
  }
}

/**
 * Returns DB config values from environment variables.
 * Extend this to fetch from SSM or other sources if needed.
 */
export function getDbConfig() {
  return {
    host: process.env.HOST_NAME,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    appName: process.env.APP_NAME || "lambda-worker",
    poolMax: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DB_CONN_MS || 5000),
    queryTimeout: Number(process.env.DB_QUERY_MS || 15000),
  };
}

export async function getDbSecretConfig() {
  const secretArn = process.env.DB_CREDENTIALS;
  if (!secretArn) {
    log.error("Missing env var DB_CREDENTIALS (Secrets Manager secret ARN).");
    throw new Error("Missing env var DB_CREDENTIALS (Secrets Manager secret ARN).");
  }
  if (!needRefreshSecret()) return cachedSecret.value;
  const parsed = await getSecretConfig(secretArn, process.env.REGION);
  if (!parsed.username || !parsed.password) {
    log.error("Secret JSON must contain 'username' and 'password'.");
    throw new Error("Secret JSON must contain 'username' and 'password'.");
  }
  cachedSecret = { value: parsed, fetchedAt: Date.now() };
  return parsed;
}

export async function getIntegrationMode() {
  return getConfigValue(process.env.INTEGRATION_MODE);
}

let cachedSecret;
const SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS || 10 * 60 * 1000);

function needRefreshSecret() {
  if (!cachedSecret) return true;
  return Date.now() - cachedSecret.fetchedAt > SECRET_TTL_MS;
}
