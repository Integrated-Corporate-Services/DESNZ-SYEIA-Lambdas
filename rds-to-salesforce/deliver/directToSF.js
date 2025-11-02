import fetch from "node-fetch";
import crypto from "crypto";
import { TransientError, PermanentError } from "../util/error.js";
import { safeJsonParse } from "../util/helpers.js";

async function getSalesforceAccessToken(env) {
  if (env.SALESFORCE_AUTH_MODE === "STATIC") {
    if (!env.SALESFORCE_ACCESS_TOKEN) throw new Error("SALESFORCE_ACCESS_TOKEN missing");
    return env.SALESFORCE_ACCESS_TOKEN;
  }
  // ...JWT flow omitted for brevity...
  throw new Error(`Unsupported SALESFORCE_AUTH_MODE: ${env.SALESFORCE_AUTH_MODE}`);
}

function mapForSalesforce(snapshot, env) {
  return {
    [env.SALESFORCE_EXT_ID_FIELD]: snapshot.applicationId,
    Name: snapshot.sections?.projectDetails?.overview?.title || `Application ${snapshot.applicationId}`,
    Status__c: "Submitted",
    Operator_Name__c: snapshot.sections?.networkOperator?.details?.operatorName,
    Operator_Contact_Email__c: snapshot.sections?.networkOperator?.contact?.email,
    Asset_Type__c: snapshot.sections?.projectDetails?.assetInformation?.assetType,
    Works_Description__c: snapshot.sections?.location?.worksOverview?.summary,
    EIA_Required__c: snapshot.sections?.supportingInformation?.eiaFees?.requiresFullEia ?? null,
    Submitted_At__c: snapshot.submittedAt,
  };
}

async function upsertToSalesforce(sfToken, body, env) {
  const extVal = encodeURIComponent(body[env.SALESFORCE_EXT_ID_FIELD]);
  const url = `${env.SALESFORCE_BASE_URL}${env.SALESFORCE_OBJECT_API}/${env.SALESFORCE_EXT_ID_FIELD}/${extVal}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${sfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeout: Number(env.HTTP_TIMEOUT_MS),
  });

  if (resp.status === 204) {
    const getResp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${sfToken}` },
      timeout: Number(env.HTTP_TIMEOUT_MS),
    });
    if (!getResp.ok) throw new Error(`SALESFORCE GET after upsert failed ${getResp.status}`);
    const rec = await getResp.json();
    return rec && rec["Id"];
  }
  if (resp.ok) {
    const data = await resp.json().catch(() => ({}));
    return data && data.id;
  }
  const text = await resp.text();
  const msg = `Salesforce upsert error ${resp.status}: ${text.slice(0, 500)}`;
  if (resp.status >= 500 || resp.status === 429) {
    throw new TransientError(msg);
  } else {
    throw new PermanentError(msg);
  }
}

export async function processDirect(job) {
  const env = process.env;
  const snapshot = safeJsonParse(job.payload_snapshot_json);
  if (!snapshot) throw new PermanentError("Invalid snapshot JSON");
  const sfToken = await getSalesforceAccessToken(env);
  const body = mapForSalesforce(snapshot, env);
  const id = await upsertToSalesforce(sfToken, body, env);
  return id || null;
}
