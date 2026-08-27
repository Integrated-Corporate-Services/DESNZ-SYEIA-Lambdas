import { initDbPool } from "./util/db.js";
import log from "./util/logger.js";
import { SQL_MARK_PUBLISHED } from "./util/queries.js";

let poolPromise = null;
async function getDbClient() {
  if (!poolPromise) poolPromise = initDbPool();
  const pool = await poolPromise;
  return pool.connect();
}

/**
 * Marks a job as published to SQS (NEW SQS MODE ONLY).
 * CRITICAL FIX: Stores sqs_message_id in transaction to prevent duplicate publishing.
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.sqsMessageId
 */
export async function markJobPublishedToSQS({ jobId, sqsMessageId }) {
  const client = await getDbClient();
  const params = [jobId, "PUBLISHED", sqsMessageId];
  log.debug("[sqsOutboxRepo.js : markJobPublishedToSQS] SQL:", SQL_MARK_PUBLISHED);
  log.debug("[sqsOutboxRepo.js : markJobPublishedToSQS] Params:", params);
  try {
    await client.query("BEGIN");
    const result = await client.query(SQL_MARK_PUBLISHED, params);
    await client.query("COMMIT");
    log.info("[sqsOutboxRepo.js : markJobPublishedToSQS] Job marked as PUBLISHED", {
      jobId,
      sqsMessageId,
      rowsAffected: result.rowCount,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    log.error("[sqsOutboxRepo.js : markJobPublishedToSQS] Transaction failed", {
      jobId,
      sqsMessageId,
      error: e.message,
      stack: e.stack,
    });
    // CRITICAL: Re-throw to trigger retry with idempotency protection
    throw e;
  } finally {
    client.release();
  }
}
