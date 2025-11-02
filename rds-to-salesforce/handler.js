import { getClaimedJobs, processJob } from "./outboxService.js";
import { log } from "./util/logger.js";

log("Handler module loaded");

export const handler = async () => {
  log(`Start mode=${process.env.INTEGRATION_MODE}`);
  const jobs = await getClaimedJobs(Number(process.env.BATCH_SIZE), Number(process.env.MAX_RETRIES));
  if (!jobs.length) {
    log("No due jobs");
    return;
  }
  for (const job of jobs) {
    await processJob(job);
  }
  log("Done");
};

// For local testing, invoke handler directly
handler();
