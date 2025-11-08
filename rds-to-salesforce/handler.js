import { getClaimedJobs, processJob } from "./outboxService.js";
import fs from "fs";
import path from "path";
import log from "./util/logger.js";

// Add this function for test data
function getTestJobs() {
  const testJobPath = path.resolve(process.cwd(), "tests/test-job.json");
  if (fs.existsSync(testJobPath)) {
    const jobData = JSON.parse(fs.readFileSync(testJobPath, "utf8"));
    return [jobData];
  }
  return [];
}

export const handler = async () => {
  log.info(`Start mode=${process.env.INTEGRATION_MODE}`);
  let jobs = await getClaimedJobs(Number(process.env.BATCH_SIZE), Number(process.env.MAX_RETRIES));
  // Only inject test job in local environment
  const isLocal = process.env.LOCAL_DEV === "true";
  if (isLocal && process.env.INJECT_TEST_JOB === "true") {
    log.debug("No due jobs, injecting test job (local only)");
    jobs = getTestJobs();
  }
  if (!jobs.length) {
    log.info("No due jobs");
    return;
  }
  for (const job of jobs) {
    await processJob(job);
  }
  log.info("Done");
};

// For local testing, uncomment the following line:
handler();
