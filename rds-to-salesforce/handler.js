import { getClaimedJobs, processJob, getJobById } from "./outboxService.js";
import log from "./util/logger.js";

/**
 * Lambda handler for processing outbox jobs and sending to Salesforce.
 */
export const handler = async (event) => {
  log.info(`[handler.js : handler] Start mode=${process.env.INTEGRATION_MODE}`);
  // SNS path (single job)
  if (Array.isArray(event?.Records) && event.Records[0]?.Sns) {
    for (const r of event.Records) {
      const msg = JSON.parse(r.Sns.Message ?? "{}");
      const { outbox_id, applicationId, idempotencyKey } = msg || {};
      if (!outbox_id) {
        log.error("[handler.js : handler] Missing outbox_id in SNS message", { msg });
        throw new Error("Missing outbox_id");
      }
      const job = await getJobById(outbox_id);
      if (!job) continue;
      try {
        await processJob(job);
      } catch (err) {
        log.error("[handler.js : handler] Failed processing SNS job; will retry", { outbox_id, err });
        throw err;
      }
    }
    return;
  }

  // EventBridge path (batch)
  if (event?.source === "aws.events" && event?.["detail-type"] === "Scheduled Event") {
    try {
      const batchSize = Number(process.env.BATCH_SIZE) || 10;
      const maxRetries = Number(process.env.MAX_RETRIES) || 3;
      const jobs = await getClaimedJobs(batchSize, maxRetries);
      if (!jobs.length) {
        log.info("[handler.js : handler] No due jobs");
        return;
      }
      for (const job of jobs) {
        try {
          await processJob(job);
        } catch (err) {
          log.error("[handler.js : handler] Failed processing EventBridge job; marked for retry", { jobId: job.id, err });
          // Do not throw; continue batch
        }
      }
      log.info("[handler.js : handler] Done");
    } catch (err) {
      log.error("[handler.js : handler] Unhandled error", { error: err });
      throw err;
    }
    return;
  }

  // Unhandled event shape
  log.warn("[handler.js : handler] Unhandled event shape", { event });
  return;
};

// Optional: catch unhandled promise rejections globally (for local/dev)
process.on("unhandledRejection", (reason) => {
  log.error("[handler.js : handler] Unhandled promise rejection", { reason });
});

//handler();


