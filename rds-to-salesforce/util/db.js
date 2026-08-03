
import { getDbConfig, getDbSecretConfig } from "./config.js";
import pg from "pg";
import log from "./logger.js";

const DB_DEFAULTS = {
  port: 5432,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.DB_IDLE_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DB_CONN_MS || 5000),
  queryTimeout: Number(process.env.DB_QUERY_MS || 15000),
  idleInTransactionSessionTimeoutMillis: Number(process.env.DB_IDLE_TRANSACTION_MS || 15000),
};

let pool;

function buildSslConfig() {
  if (process.env.NODE_ENV === "local") return false;
  //const caPath = process.env.RDS_CA_PATH || path.join(__dirname, "rds-combined-ca-bundle.pem");
  //const ca = fs.readFileSync(caPath, "utf8");
  return {  require: true, 
            rejectUnauthorized: false, 
            //ca 
    };
}

function needRefreshSecret() {
  return false;
}

export async function initDbPool() {
  if (pool && !needRefreshSecret()) return pool;

  if (process.env.NODE_ENV === "local") {
    const cfg = getDbConfig();
    pool = new pg.Pool({
      host: cfg.host,
      port: cfg.port || DB_DEFAULTS.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      max: cfg.poolMax,
      idleTimeoutMillis: cfg.idleTimeoutMillis,
      connectionTimeoutMillis: cfg.connectionTimeoutMillis,
      ssl: false,
      keepAlive: true,
      query_timeout: cfg.queryTimeout,
      application_name: cfg.appName,
    });
    pool.on("connect", async (client) => {
      try {
        await client.query(`SET statement_timeout = ${DB_DEFAULTS.queryTimeout}`);
        await client.query(`SET idle_in_transaction_session_timeout = ${DB_DEFAULTS.idleInTransactionSessionTimeoutMillis}`);
      } catch (e) {
        log.warn("Failed to set session timeouts:", e);
      }
    });
    await pool.query("SELECT 1");
    return pool;
  }

  // use Secrets Manager
  const creds = await getDbSecretConfig();
  const host = creds.host || process.env.HOST_NAME;
  const port = Number(creds.port || process.env.DB_PORT || DB_DEFAULTS.port);
  const database = creds.dbname || process.env.DB_NAME;
  if (!host || !database) {
    log.error("Database 'host' and 'dbname' must be provided via secret or env.");
    throw new Error("Database 'host' and 'dbname' must be provided via secret or env.");
  }

  const ssl = buildSslConfig();

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
      await client.query(`SET idle_in_transaction_session_timeout = ${DB_DEFAULTS.idleInTransactionSessionTimeoutMillis}`);
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