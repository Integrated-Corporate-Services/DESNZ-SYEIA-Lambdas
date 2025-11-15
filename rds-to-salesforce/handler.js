import { getClaimedJobs, processJob } from "./outboxService.js";
import log from "./util/logger.js";

/**
 * Lambda handler for processing outbox jobs and sending to Salesforce.
 */
export const handler = async () => {
  log.info(`[handler.js : handler] Start mode=${process.env.INTEGRATION_MODE}`);
  try {
    const batchSize = Number(process.env.BATCH_SIZE) || 10;
    const maxRetries = Number(process.env.MAX_RETRIES) || 3;
    const jobs = await getClaimedJobs(batchSize, maxRetries);
    if (!jobs.length) {
  log.info("[handler.js : handler] No due jobs");
      return;
    }
    for (const job of jobs) {
      await processJob(job);
    }
  log.info("[handler.js : handler] Done");
  } catch (err) {
  log.error("[handler.js : handler] Unhandled error", { error: err });
    throw err;
  }
};

// Optional: catch unhandled promise rejections globally (for local/dev)
process.on("unhandledRejection", (reason) => {
  log.error("[handler.js] Unhandled promise rejection", { reason });
});

//handler();