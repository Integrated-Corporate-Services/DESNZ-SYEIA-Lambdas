
import { processDirect } from "../deliver/directToSF.js";
import Ajv from "ajv";
import fs from "fs";
import path from "path";
import { getMockEnv } from "./mockEnv.js";
import { getSampleJob } from "./test-job.json";

jest.mock("node-fetch", () => jest.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "MOCK_ID_123" })
})));

function getSchema() {
  const schemaPath = path.resolve(__dirname, "./s37-schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
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

  it("should map payload, call Salesforce, and return mock id", async () => {
    const id = await processDirect(getSampleJob());
    expect(id).toBe("MOCK_ID_123");
  });

  it("should validate mapped payload against schema", async () => {
    const snapshot = JSON.parse(getSampleJob().payload_snapshot_json);
    const schema = getSchema();
    const { valid, errors } = validateAgainstSchema(snapshot, schema);
    expect(valid).toBe(true);
    if (!valid) {
      console.error(errors);
    }
  });
});
