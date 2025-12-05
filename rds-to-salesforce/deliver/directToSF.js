import { getSalesforceConfig } from "../util/config.js";
import { TransientError, PermanentError } from "../util/error.js";
import { safeJsonParse, reorderPayload } from "../util/helpers.js";
import log from "../util/logger.js";
import { getAccessToken } from "../util/getSalesforceToken.js";
import axios from "axios";

/**
 * Sends a payload to Salesforce using the configured authentication and API endpoint.
 * @param {string} payload - The JSON stringified payload to send.
 * @param {object} env - The environment variables/config.
 * @returns {Promise<string|null>} The Salesforce record ID or null.
 */
async function sendPayload(payload, env) {
  let token;
  const sfConfig = await getSalesforceConfig();
  const salesforceAuthMode = String(sfConfig.authMode).toUpperCase();
  if (salesforceAuthMode === "STATIC") {
    if (!sfConfig.accessToken) throw new PermanentError("SALESFORCE_ACCESS_TOKEN missing");
    token = sfConfig.accessToken;
  } else if (salesforceAuthMode === "OAUTH_CLIENT_CREDENTIALS") {
    log.info("[directToSF.js : sendPayload] Fetching Salesforce access token...");
    token = await getAccessToken({
      clientId: sfConfig.clientId,
      clientSecret: sfConfig.clientSecret,
      tokenUrl: sfConfig.tokenUrl
    });
  } else {
    throw new PermanentError(`Unsupported SALESFORCE_AUTH_MODE: ${salesforceAuthMode}`);
  }
  const url = `${sfConfig.baseUrl}${sfConfig.objectApi}`;
  log.info(`[directToSF.js : sendPayload] Sending payload to Salesforce URL:`, url);
  try {
    const response = await axios.post(url, {
      External_System__c: 'AWS',
      Status__c: 'Received',
      Payload__c: payload
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: Number(env.HTTP_TIMEOUT_MS)
    });
    log.info(`[directToSF.js : sendPayload] Salesforce response:`, response.data);
    log.info(`[directToSF.js : sendPayload] Salesforce response status:`, response.status);
    log.info(`[directToSF.js : sendPayload] Salesforce response headers:`, response.headers);
    // Salesforce returns { id, success, errors }
    if (response.data && response.data.success === true && response.data.id) {
      return response.data.id;
    } else if (response.data && Array.isArray(response.data.errors) && response.data.errors.length > 0) {
      throw new PermanentError(`[directToSF.js : sendPayload] Salesforce errors: ${JSON.stringify(response.data.errors)}`);
    } else {
      throw new PermanentError(`[directToSF.js : sendPayload] Unexpected Salesforce response: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const text = JSON.stringify(error.response.data);
      const msg = `[directToSF.js : sendPayload] Salesforce upsert error ${status}: ${text.slice(0, 500)}`;
      if (status >= 500 || status === 429) {
        throw new TransientError(msg);
      } else {
        throw new PermanentError(msg);
      }
    }
    log.error(`[directToSF.js : sendPayload] Salesforce request error:`, error.message, error.stack);
    throw error;
  }
}

/**
 * Processes a job and sends its payload to Salesforce.
 * @param {object} job - The job object containing payload_snapshot_json.
 * @returns {Promise<string|null>} The Salesforce record ID or null.
 */
export async function processDirect(job) {
  const env = process.env;
  const snapshot = safeJsonParse(job.payload_snapshot_json);
  if (!snapshot) throw new PermanentError("Invalid snapshot JSON");
  const reordered = reorderPayload(snapshot);
  log.info(`[directToSF.js/processDirect] Salesforce payload:`, JSON.stringify(reordered));
  try {
    const id = await sendPayload(JSON.stringify(reordered), env);
    return id || null;
  } catch (error) {
    log.error(`[directToSF.js/processDirect] Error:`, error.message, error.stack);
    throw error;
  }
}




