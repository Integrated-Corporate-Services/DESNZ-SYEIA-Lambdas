import axios from 'axios';
import log from "./logger.js";

export async function getAccessToken({ clientId, clientSecret, tokenUrl }) {
  try {
    log.info('[Salesforce] Requesting access token...');
    const response = await axios.post(tokenUrl, null, {
      params: {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }
    });
    log.info('[Salesforce] Token response:', response.data);
    return response.data.access_token;
  } catch (error) {
    log.error('[Salesforce] Error fetching access token:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error_description || error.message);
  }
}