import { processJob } from "./outboxService.js";
import fs from "fs";
import path from "path";
import log from "./util/logger.js";

// Load test job from tests/test-job.json and wrap as a job object matching SQL_CLAIM_BATCH
const testJobPath = path.resolve(process.cwd(), "tests/test-job.json");
const payload = JSON.parse(fs.readFileSync(testJobPath, "utf8"));
const jobData = {
  outbox_id: 999999,
  application_id: payload.applicationId || payload.application_id || "local-app-id",
  payload_snapshot_json: JSON.stringify(payload),
  attempt_count: 0,
  event_type: payload.event_type || "LOCAL_TEST"
};

// Optionally set up any environment variables needed for local/dev
envSetup();

async function main() {
  try {
    await processJob(jobData);
    log.info("Test job processed successfully");
  } catch (err) {
    log.error("Error processing test job", { error: err });
  }
}

function envSetup() {
  process.env.LOCAL_DEV = "true";
  process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "direct";
  // Add any other env vars needed for local/dev here
}

main();
