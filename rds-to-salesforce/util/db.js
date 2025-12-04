
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import pg from "pg";
import fs from "fs";
import path from "path";
import log from "./logger.js";

const secretArn = process.env.DB_CREDENTIALS;
if (!secretArn) {
  log.error("Missing env var DB_CREDENTIALS (Secrets Manager secret ARN).");
  throw new Error("Missing env var DB_CREDENTIALS (Secrets Manager secret ARN).");
}

const secretsClient = new SecretsManagerClient({ region: process.env.REGION });

const DB_DEFAULTS = {
  port: 5432,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.DB_IDLE_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DB_CONN_MS || 5000),
  queryTimeout: Number(process.env.DB_QUERY_MS || 15000),
};

let pool;
let cachedSecret;
const SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS || 10 * 60 * 1000);

function needRefreshSecret() {
  if (!cachedSecret) return true;
  return Date.now() - cachedSecret.fetchedAt > SECRET_TTL_MS;
}

async function fetchDbSecret() {
  const cmd = new GetSecretValueCommand({ SecretId: secretArn });
  const res = await secretsClient.send(cmd);

  let payload;
  if (res.SecretString) {
    payload = res.SecretString;
  } else if (res.SecretBinary) {
    payload = Buffer.from(res.SecretBinary, "base64").toString("utf8");
  } else {
    log.error("Secret has no SecretString or SecretBinary.");
    throw new Error("Secret has no SecretString or SecretBinary.");
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    log.error("SecretString is not valid JSON.");
    throw new Error("SecretString is not valid JSON.");
  }

  if (!parsed.username || !parsed.password) {
    log.error("Secret JSON must contain 'username' and 'password'.");
    throw new Error("Secret JSON must contain 'username' and 'password'.");
  }

  cachedSecret = { value: parsed, fetchedAt: Date.now(), versionId: res.VersionId };
  return parsed;
}

async function getDbCredentials() {
  if (needRefreshSecret()) return fetchDbSecret();
  return cachedSecret.value;
}

function buildSslConfig() {
  if (process.env.NODE_ENV === "local") return false;
  //const caPath = process.env.RDS_CA_PATH || path.join(__dirname, "rds-combined-ca-bundle.pem");
  //const ca = fs.readFileSync(caPath, "utf8");
  return {  require: true, 
            rejectUnauthorized: false, 
            //ca 
    };
}

export async function initDbPool() {
  if (pool && !needRefreshSecret()) return pool;

  if (process.env.NODE_ENV === "local") {
    pool = new pg.Pool({
      host: process.env.HOST_NAME,
      port: Number(process.env.DB_PORT) || DB_DEFAULTS.port,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: DB_DEFAULTS.max,
      idleTimeoutMillis: DB_DEFAULTS.idleTimeoutMillis,
      connectionTimeoutMillis: DB_DEFAULTS.connectionTimeoutMillis,
      ssl: false,
      keepAlive: true,
      query_timeout: DB_DEFAULTS.queryTimeout,
      application_name: process.env.APP_NAME || "lambda-worker",
    });
    pool.on("connect", async (client) => {
      try {
        await client.query(`SET statement_timeout = ${DB_DEFAULTS.queryTimeout}`);
        await client.query(`SET idle_in_transaction_session_timeout = 15000`);
      } catch (e) {
        log.warn("Failed to set session timeouts:", e);
      }
    });
    await pool.query("SELECT 1");
    return pool;
  }

  // Otherwise, use Secrets Manager
  const creds = await getDbCredentials();
  const host = creds.host || process.env.HOST_NAME;
  const port = Number(creds.port || process.env.DB_PORT || DB_DEFAULTS.port);
  const database = creds.dbname || process.env.DB_NAME;
  if (!host || !database) {
    log.error("Database 'host' and 'dbname' must be provided via secret or env.");
    throw new Error("Database 'host' and 'dbname' must be provided via secret or env.");
  }

  const ssl = buildSslConfig();

  if (pool && needRefreshSecret()) {
    try {
      await pool.end();
    } catch (e) {
      log.warn("Previous pool end() failed:", e);
    }
    pool = undefined;
  }

  pool = new pg.Pool({
    host,
    port,
    database,
    user: creds.username,
    password: creds.password,
    max: DB_DEFAULTS.max,
    idleTimeoutMillis: DB_DEFAULTS.idleTimeoutMillis,
    connectionTimeoutMillis: DB_DEFAULTS.connectionTimeoutMillis,
    ssl,
    keepAlive: true,
    query_timeout: DB_DEFAULTS.queryTimeout,
    application_name: process.env.APP_NAME || "lambda-worker",
  });

  pool.on("connect", async (client) => {
    try {
      await client.query(`SET statement_timeout = ${DB_DEFAULTS.queryTimeout}`);
      await client.query(`SET idle_in_transaction_session_timeout = 15000`);
    } catch (e) {
      log.warn("Failed to set session timeouts:", e);
    }
  });

  await pool.query("SELECT 1");
  return pool;
}

export function getPool() {
  if (!pool) {
    log.error("DB pool not initialized. Call initDbPool() first.");
    throw new Error("DB pool not initialized. Call initDbPool() first.");
  }
  return pool;
}