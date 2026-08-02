import { initDbPool } from "./util/db.js";
import log from "./util/logger.js";
import {
  SQL_CLAIM_BATCH,
  SQL_MARK_DIRECT_SUCCESS_OUTBOX,
  SQL_MARK_APPFLOW_HANDOFF,
  SQL_MARK_FAILURE,
  SQL_GET_JOB_BY_OUTBOX_ID,
} from "./util/queries.js";

let poolPromise = null;
async function getDbClient() {
  if (!poolPromise) poolPromise = initDbPool();
  const pool = await poolPromise;
  return pool.connect();
}

/**
 * Claims a batch of jobs from the outbox.
 * @param {Object} params
 * @param {number} params.limit
 * @param {number} params.maxRetries
 * @returns {Promise<Array>}
 */
export async function claimBatch({ limit, maxRetries }) {
  log.debug("[outboxRepo.js : claimBatch] Claiming batch of jobs");
  const client = await getDbClient();
  log.debug("[outboxRepo.js : claimBatch] Connected to DB");
  const params = ["PENDING", "ERROR", Number(maxRetries), Number(limit), "SENDING"];
  log.debug("[outboxRepo.js : claimBatch] SQL:", SQL_CLAIM_BATCH);
  log.debug("[outboxRepo.js : claimBatch] Params:", params);
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(SQL_CLAIM_BATCH, params);
    await client.query("COMMIT");
    log.debug("[outboxRepo.js : claimBatch] Returned rows:", rows);
    return rows;
  } catch (e) {
    await client.query("ROLLBACK");
    log.error("[outboxRepo.js : claimBatch] Error:", e && (e.stack || e.message || e));
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Marks a job as successfully sent to Salesforce (direct).
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.applicationId
 * @param {string} params.salesforceId
 */
export async function markDirectSuccess({ jobId, applicationId, salesforceId }) {
  const client = await getDbClient();
  const params = [jobId, "SENT", salesforceId];
  log.debug("[outboxRepo.js : markDirectSuccess] SQL:", SQL_MARK_DIRECT_SUCCESS_OUTBOX);
  log.debug("[outboxRepo.js : markDirectSuccess] Params:", params);
  try {
    await client.query("BEGIN");
    await client.query(SQL_MARK_DIRECT_SUCCESS_OUTBOX, params);
    //await client.query(SQL_MARK_DIRECT_SUCCESS_APP, [applicationId, salesforceId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    log.error("[outboxRepo.js : markDirectSuccess] Error:", e && (e.stack || e.message || e));
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Marks a job as failed, with retry/backoff logic.
 * @param {Object} params
 * @param {string} params.jobId
 * @param {number} params.attemptCountAfterClaim
 * @param {string} params.errorMessage
 * @param {number} params.maxRetries
 */
export async function markFailure({ jobId, attemptCountAfterClaim, errorMessage, maxRetries }) {
  const client = await getDbClient();
  const exhausted = attemptCountAfterClaim >= Number(maxRetries);
  const status = exhausted ? "FAILED" : "PENDING";
  const safeAttemptCount = Number.isFinite(attemptCountAfterClaim) ? attemptCountAfterClaim : 0;
  const backoffSeconds = Math.min(Math.pow(2, Math.max(0, safeAttemptCount - 1)) * 30, 6 * 60 * 60);
  const nextAt = exhausted ? null : new Date(Date.now() + backoffSeconds * 1000).toISOString();
  const params = [jobId, status, String(errorMessage || "").slice(0, 500), nextAt];
  log.debug("[outboxRepo.js : markFailure] SQL:", SQL_MARK_FAILURE);
  log.debug("[outboxRepo.js : markFailure] Params:", params);
  try {
    await client.query(SQL_MARK_FAILURE, params);
  } catch (e) {
    log.error("[outboxRepo.js : markFailure] Error:", e && (e.stack || e.message || e));
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Marks a job as handed off to AppFlow.
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.s3Key
 */
export async function markAppflowHandoff({ jobId, s3Key }) {
  const client = await getDbClient();
  const params = [jobId, "HANDOFF", s3Key];
  log.debug("[outboxRepo.js : markAppflowHandoff] SQL:", SQL_MARK_APPFLOW_HANDOFF);
  log.debug("[outboxRepo.js : markAppflowHandoff] Params:", params);
  try {
    await client.query("BEGIN");
    await client.query(SQL_MARK_APPFLOW_HANDOFF, params);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    log.error("[outboxRepo.js : markAppflowHandoff] Error:", e && (e.stack || e.message || e));
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Fetch a single outbox job by id.
 * @param {string|number} outboxId
 * @returns {Promise<Object|null>} Job row or null if not found
 */
export async function getJobByOutboxId(outboxId) {
  log.debug(`[outboxRepo.js : getJobByOutboxId] Fetching job for outbox_id=${outboxId}`);
  const client = await getDbClient();
  try {
    const res = await client.query(SQL_GET_JOB_BY_OUTBOX_ID, [outboxId]);
    if (res.rows[0]) {
      log.debug(`[outboxRepo.js : getJobByOutboxId] Found job for outbox_id=${outboxId}`);
    } else {
      log.warn(`[outboxRepo.js : getJobByOutboxId] No job found for outbox_id=${outboxId}`);
    }
    return res.rows[0] || null;
  } catch (err) {
    log.error("[outboxRepo.js : getJobByOutboxId] Error:", err && (err.stack || err.message || err));
    throw err;
  } finally {
    client.release();
  }
}
