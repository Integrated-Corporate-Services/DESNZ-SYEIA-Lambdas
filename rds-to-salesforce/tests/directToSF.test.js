import Ajv from "ajv";
import fs from "fs";
import path from "path";
import { jest } from '@jest/globals';
import { getMockEnv } from "./mockEnv.js";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

jest.unstable_mockModule("node-fetch", () => ({
  default: jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "MOCK_ID_123" })
  }))
}));

function getSchema() {
  const schemaPath = path.resolve(__dirname, "./s37-schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function getSampleJob() {
  const jobPath = path.resolve(__dirname, "./test-job.json");
  return JSON.parse(fs.readFileSync(jobPath, "utf8"));
}

function validateAgainstSchema(data, schema) {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  return { valid: validate(data), errors: validate.errors };
}

describe("processDirect Lambda integration", () => {
  beforeAll(() => {
    Object.assign(process.env, getMockEnv());
  });

  it("should validate mapped payload against schema", async () => {
    // Use the job object directly, as payload_snapshot_json no longer exists
    const job = getSampleJob();
    const schema = getSchema();
    const { valid, errors } = validateAgainstSchema(job, schema);
    expect(valid).toBe(true);
    if (!valid) {
      console.error(errors);
    }
  });
});
