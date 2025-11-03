import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { safeJsonParse } from "../util/helpers.js";
import { PermanentError } from "../util/error.js";
import { flattenForAppflow } from "../transform/flattenForAppflow.js";

const s3 = new S3Client({});

async function uploadToS3(applicationId, flattened, env) {
  const key = `${env.S3_PREFIX || "submissions/"}application_${applicationId}_${Date.now()}.json`;
  const cmd = new PutObjectCommand({
  Bucket: env.S3_BUCKET,
    Key: key,
    Body: JSON.stringify(flattened),
    ContentType: "application/json",
  });
  await s3.send(cmd);
  return key;
}

export async function processAppflow(job) {
  const env = process.env;
  const snapshot = safeJsonParse(job.payload_snapshot_json);
  if (!snapshot) throw new PermanentError("Invalid snapshot JSON");
  const flat = flattenForAppflow(snapshot);
  const key = await uploadToS3(job.application_id, flat, env);
  return key;
}
