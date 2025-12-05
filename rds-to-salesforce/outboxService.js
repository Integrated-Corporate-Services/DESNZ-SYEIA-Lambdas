import { getIntegrationMode } from "./util/config.js";
import { claimBatch, markDirectSuccess, markAppflowHandoff, markFailure, getJobByOutboxId } from "./outboxRepo.js";
import { processDirect } from "./deliver/directToSF.js";
import { processAppflow } from "./deliver/appflow.js";
import { TransientError, PermanentError } from "./util/error.js";
import { sleep, safeJsonParse } from "./util/helpers.js";
import log from "./util/logger.js";
import { buildSFPayload } from "./transform/buildSFPayload.js";
import { flattenForAppflow } from "./transform/flattenForAppflow.js";

/**
 * Processes a single outbox job and handles delivery to Salesforce or AppFlow.
 * @param {object} job - The outbox job object.
 */
export async function processJob(job) {
  const { payload, jobId } = extractPayload(job);
  if (!payload) {
    log.error(`[outboxService.js:processJob][job:${jobId}] ERROR: Payload is null or invalid.`);
    await handleJobError(job, new PermanentError('Invalid or empty payload'));
    return;
  }

  const integrationMode = await getIntegrationMode();
  const mode = String(integrationMode).toUpperCase();
  try {
    logRawPayload(job, payload, jobId);
    if (mode === "DIRECT") {
      await handleDirectJob(job, payload, jobId);
    } else if (mode === "APPFLOW") {
      await handleAppflowJob(job, payload, jobId);
    } else {
      throw new PermanentError(`Unsupported mode: ${mode}`);
    }
  } catch (err) {
    await handleJobError(job, err);
  }
}

async function handleDirectJob(job, payload, jobId) {
  log.debug(`[outboxService.js:handleDirectJob][job:${jobId}] Parsed snapshot:`, payload);
  const salesforcePayload = buildSFPayload(payload, process.env);
  log.debug(`[outboxService.js:handleDirectJob][job:${jobId}] Salesforce payload:`, salesforcePayload);
  const salesforceId = await processDirect(job);
  await markDirectSuccess({
    jobId: job.outbox_id,
    applicationId: job.application_id,
    salesforceId,
  });
  log.debug(`[outboxService.js:handleDirectJob] Job ${job.outbox_id} → SENT (SALESFORCE id: ${salesforceId || "ext-id"})`);
}

async function handleAppflowJob(job, payload, jobId) {
  log.debug(`[outboxService.js:handleAppflowJob][job:${jobId}] Parsed snapshot:`, payload);
  const appflowPayload = flattenForAppflow(payload);
  log.debug(`[outboxService.js:handleAppflowJob][job:${jobId}] Flattened AppFlow payload:`, appflowPayload);
  const s3Key = await processAppflow(job);
  await markAppflowHandoff({ jobId: job.outbox_id, s3Key });
  log.debug(`[outboxService.js:handleAppflowJob] Job ${job.outbox_id} → HANDOFF (S3: ${s3Key})`);
}

/**
 * Claims a batch of jobs from the outbox.
 * @param {number} limit - Max number of jobs to claim.
 * @param {number} maxRetries - Max retry attempts.
 * @returns {Promise<Array>} Array of claimed jobs.
 */
export async function getClaimedJobs(limit, maxRetries) {
  return await claimBatch({ limit, maxRetries });
}

function extractPayload(job) {
  log.debug(`[outboxService.js:extractPayload][job:${job && job.outbox_id}] Extracting payload.`);
  let payload;
  if (typeof job.payload_snapshot_json === 'string') {
    log.debug(`[outboxService.js:extractPayload][job:${job && job.outbox_id}] Parsing payload from string.`);
    payload = safeJsonParse(job.payload_snapshot_json);
  } else if (typeof job.payload_snapshot_json === 'object' && job.payload_snapshot_json !== null) {
    log.debug(`[outboxService.js:extractPayload][job:${job && job.outbox_id}] Using payload as object.`);
    payload = job.payload_snapshot_json;
  } else {
    log.warn(`[outboxService.js:extractPayload][job:${job && job.outbox_id}] Payload is null or invalid type.`);
    payload = null;
  }
  log.debug(`[outboxService.js:extractPayload][job:${job && job.outbox_id}] Extracted payload:`, payload);
  return { payload, jobId: job.outbox_id };
}

function logRawPayload(job, payload, jobId) {
  try {
    if (payload) {
  log.debug(`[outboxService.js : logRawPayload][job:${jobId}] Raw DB payload:`, JSON.stringify(payload, null, 2));
    } else if (job && job.payload_snapshot_json) {
      const rawPayload = typeof job.payload_snapshot_json === 'string'
        ? JSON.stringify(JSON.parse(job.payload_snapshot_json), null, 2)
        : JSON.stringify(job.payload_snapshot_json, null, 2);
  log.debug(`[outboxService.js : logRawPayload][job:${jobId}] Raw DB payload:`, rawPayload);
    }
  } catch (e) {
  log.debug(`[outboxService.js : logRawPayload][job:${jobId}] Raw DB payload:`, String(job && job.payload_snapshot_json));
  }
}

async function handleJobError(job, err) {
  const attemptCountAfterClaim = Number(job.attempt_count);
  //const jobId = job.outbox_id;
  const transient = err instanceof TransientError;
  log.error(`[outboxService.js : handleJobError] Error:`, err.message, err.stack);
  if (transient) await sleep(100 + Math.random() * 250);
  await markFailure({
    jobId: job.outbox_id,
    attemptCountAfterClaim,
    errorMessage: err.message,
    maxRetries: process.env.MAX_RETRIES,
  });
  log.error(`[outboxService.js : handleJobError] failed (${transient ? "transient" : "permanent"}):`, err.message);
}

/**
 * Fetch a single outbox job by id.
 * @param {string|number} outboxId
 * @returns {Promise<Object|null>} Job row or null if not found
 */
export async function getJobById(outboxId) {
  log.debug(`[outboxService.js : getJobById] Fetching job for outbox_id=${outboxId}`);
  const job = await getJobByOutboxId(outboxId);
  if (job) {
    log.debug(`[outboxService.js : getJobById] Found job for outbox_id=${outboxId}`);
  } else {
    log.warn(`[outboxService.js : getJobById] No job found for outbox_id=${outboxId}`);
  }
  return job;
}