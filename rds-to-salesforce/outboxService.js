import { claimBatch, markDirectSuccess, markAppflowHandoff, markFailure } from "./outboxRepo.js";
import { processDirect } from "./deliver/directToSF.js";
import { processAppflow } from "./deliver/appflow.js";
import { TransientError, PermanentError } from "./util/error.js";
import { sleep } from "./util/helpers.js";
import log from "./util/logger.js";
import { safeJsonParse } from "./util/helpers.js";
import { buildSFPayload } from "./transform/buildSFPayload.js";
import { flattenForAppflow } from "./transform/flattenForAppflow.js";

export async function processJob(job) {
  try {
  log.debug(`[job:${job.outbox_id}] Raw DB payload:`, typeof job.payload_snapshot_json === 'string' ? job.payload_snapshot_json : JSON.stringify(job.payload_snapshot_json));
    let reference;
    if (process.env.INTEGRATION_MODE === "DIRECT") {
      const snapshot = safeJsonParse(job.payload_snapshot_json);
      log.debug(`[job:${job.outbox_id}] Parsed snapshot:`, JSON.stringify(snapshot));
      const sfPayload = buildSFPayload(snapshot, process.env);
      log.debug(`[job:${job.outbox_id}] Salesforce payload:`, JSON.stringify(sfPayload));
      reference = await processDirect(job);
      await markDirectSuccess({
        jobId: job.outbox_id,
        applicationId: job.application_id,
        salesforceId: reference,
      });
      log.debug(`Job ${job.outbox_id} → SENT (SALESFORCE id: ${reference || "ext-id"})`);
    } else if (process.env.INTEGRATION_MODE === "APPFLOW") {
      const snapshot = safeJsonParse(job.payload_snapshot_json);
      log.debug(`[job:${job.outbox_id}] Parsed snapshot:`, JSON.stringify(snapshot));
      const flatPayload = flattenForAppflow(snapshot);
      log.debug(`[job:${job.outbox_id}] Flattened AppFlow payload:`, JSON.stringify(flatPayload));
      const s3Key = await processAppflow(job);
      await markAppflowHandoff({ jobId: job.outbox_id, s3Key });
      log.debug(`Job ${job.outbox_id} → HANDOFF (S3: ${s3Key})`);
    } else {
      throw new PermanentError(`Unsupported mode: ${process.env.INTEGRATION_MODE}`);
    }
  } catch (err) {
    const attemptCountAfterClaim = Number(job.attempt_count);
    const transient = err instanceof TransientError;
    log.error(`[job:${job.outbox_id}] Error:`, err.message, err.stack);
    if (transient) await sleep(100 + Math.random() * 250);
    await markFailure({
      jobId: job.outbox_id,
      attemptCountAfterClaim,
      errorMessage: err.message,
      maxRetries: process.env.MAX_RETRIES,
    });
    log.error(`Job ${job.outbox_id} failed (${transient ? "transient" : "permanent"}):`, err.message);
  }
}

export async function getClaimedJobs(limit, maxRetries) {
  return await claimBatch({ limit, maxRetries });
}
