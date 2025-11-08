import fetch from "node-fetch";
import { TransientError, PermanentError } from "../util/error.js";
import { safeJsonParse, reorderPayload } from "../util/helpers.js";
import log from "../util/logger.js";
import { getAccessToken } from "../util/getSalesforceToken.js";
import axios from "axios";

async function getSalesforceAccessToken(env) {
  if (env.SALESFORCE_AUTH_MODE === "STATIC") {
    if (!env.SALESFORCE_ACCESS_TOKEN) throw new Error("SALESFORCE_ACCESS_TOKEN missing");
    return env.SALESFORCE_ACCESS_TOKEN;
  }
  if (env.SALESFORCE_AUTH_MODE === "OAUTH_CLIENT_CREDENTIALS") {
    log.info("Fetching Salesforce access token...");
    return await getAccessToken({
      clientId: env.SALESFORCE_CLIENT_ID,
      clientSecret: env.SALESFORCE_CLIENT_SECRET,
      tokenUrl: env.SALESFORCE_TOKEN_URL
    });
  }
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
  const url = `${env.SALESFORCE_BASE_URL}/${env.SALESFORCE_OBJECT_API}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${sfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeout: Number(env.HTTP_TIMEOUT_MS),
  });

  /*if (resp.status === 204) {
    const getResp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${sfToken}` },
      timeout: Number(env.HTTP_TIMEOUT_MS),
    });
    if (!getResp.ok) throw new Error(`SALESFORCE GET after upsert failed ${getResp.status}`);
    const rec = await getResp.json();
    return rec && rec["Id"];
  }*/
  if (resp.ok) {
    log.debug("Salesforce upsert response OK");
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
  // Reorder both top-level and sections keys in one call
  const reordered = reorderPayload(snapshot);
  log.info(`Salesforce payload:`, JSON.stringify(reordered));
  try {
    const id = await sendPayload(JSON.stringify(reordered), env);
    return id || null;
  } catch (error) {
    log.error(`Error:`, error.message, error.stack);
    throw error;
  }
}

async function sendPayload(payload, env) {
  try {
    const token = await getAccessToken({
      clientId: env.SALESFORCE_CLIENT_ID,
      clientSecret: env.SALESFORCE_CLIENT_SECRET,
      tokenUrl: env.SALESFORCE_TOKEN_URL
    });
    const url = `${env.SALESFORCE_BASE_URL}${env.SALESFORCE_OBJECT_API}`;
    log.info(`Sending payload to Salesforce URL:`, url);
    const response = await axios.post(url, {
      External_System__c: 'AWS',
      Status__c: 'Received',
      Payload__c: payload
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    log.info(`Salesforce response:`, JSON.stringify(response.data));
    log.info(`Salesforce response status:`, response.status);
    log.info(`Salesforce response headers:`, JSON.stringify(response.headers));

    return response.data && response.data.id;
  } catch (error) {
    log.error(`Salesforce request error:`, error.message, error.stack);
    throw error;
  }
}


