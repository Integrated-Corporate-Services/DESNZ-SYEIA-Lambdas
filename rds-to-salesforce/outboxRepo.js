import pg from "pg";
import { log } from "./util/logger.js";
import {
  SQL_CLAIM_BATCH,
  SQL_MARK_DIRECT_SUCCESS_OUTBOX,
  SQL_MARK_DIRECT_SUCCESS_APP,
  SQL_MARK_APPFLOW_HANDOFF,
  SQL_MARK_FAILURE,
} from "./util/queries.js";

export const pool = new pg.Pool({
  host: process.env.HOST_NAME,
  port: Number(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 5,
  idleTimeoutMillis: 10000,
});

export async function claimBatch({ limit, maxRetries }) {
  const client = await pool.connect();
  log("Connected to DB");
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(SQL_CLAIM_BATCH, [
      "PENDING",
      "ERROR",
      Number(maxRetries),
      Number(limit),
      "SENDING",
    ]);
    await client.query("COMMIT");
    return rows;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function markDirectSuccess({ jobId, applicationId, salesforceId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL_MARK_DIRECT_SUCCESS_OUTBOX, [jobId, "SENT", salesforceId]);
    await client.query(SQL_MARK_DIRECT_SUCCESS_APP, [applicationId, salesforceId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function markAppflowHandoff({ jobId, s3Key }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(SQL_MARK_APPFLOW_HANDOFF, [jobId, "HANDOFF", s3Key]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function markFailure({ jobId, attemptCountAfterClaim, errorMessage, maxRetries }) {
  const client = await pool.connect();
  try {
    const exhausted = attemptCountAfterClaim >= Number(maxRetries);
    const status = exhausted ? "DEAD" : "PENDING";
    const nextAt = exhausted ? null : (new Date(Date.now() + (Math.min(Math.pow(2, Math.max(0, attemptCountAfterClaim - 1)) * 30, 6 * 60 * 60) * 1000))).toISOString();
    await client.query(SQL_MARK_FAILURE, [
      jobId,
      status,
      String(errorMessage || "").slice(0, 500),
      nextAt,
    ]);
  } finally {
    client.release();
  }
}
