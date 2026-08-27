import axios, { AxiosError } from 'axios';
import { getSalesforceConfig } from '../config/env.config';
import { createLogger } from '../util/logger';
import { RetryableProcessingError, SalesforceAuthError, SalesforceRateLimitError, SalesforceValidationError } from '../errors';
import type { SalesforceIngestResponse } from '../types';
import { SALESFORCE_STATUS_CODES } from '../constants';

const logger = createLogger('salesforce.repository');

async function getAccessToken(clientId: string, clientSecret: string, tokenUrl: string): Promise<string> {
  try {
    const response = await axios.post(tokenUrl, null, {
      params: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret },
    });
    return response.data.access_token;
  } catch (error) {
    const axiosError = error as AxiosError<{ error_description?: string }>;
    throw new SalesforceAuthError(axiosError.response?.data?.error_description || axiosError.message);
  }
}

class SalesforceRepository {
  async sendPayload(payload: Record<string, unknown>): Promise<SalesforceIngestResponse> {
    const sfConfig = await getSalesforceConfig();
    const authMode = String(sfConfig.authMode).toUpperCase();

    let token: string;
    if (authMode === 'STATIC') {
      if (!sfConfig.accessToken) {
        throw new SalesforceAuthError('SALESFORCE_ACCESS_TOKEN missing');
      }
      token = sfConfig.accessToken;
    } else if (authMode === 'OAUTH_CLIENT_CREDENTIALS') {
      token = await getAccessToken(sfConfig.clientId, sfConfig.clientSecret, sfConfig.tokenUrl);
    } else {
      throw new SalesforceAuthError(`Unsupported SALESFORCE_AUTH_MODE: ${authMode}`);
    }

    const url = `${sfConfig.baseUrl}${sfConfig.objectApi}`;

    try {
      const response = await axios.post<SalesforceIngestResponse>(
        url,
        {
          External_System__c: 'AWS',
          Status__c: 'Received',
          Payload__c: JSON.stringify(payload),
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: sfConfig.httpTimeoutMs,
        },
      );

      if (response.data?.success === true && response.data.id) {
        logger.info('Salesforce ingest successful', { id: response.data.id });
        return response.data;
      }

      if (Array.isArray(response.data?.errors) && response.data.errors.length > 0) {
        throw new SalesforceValidationError('Salesforce returned errors', response.data.errors);
      }

      throw new SalesforceValidationError(`Unexpected Salesforce response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (error instanceof SalesforceValidationError || error instanceof SalesforceAuthError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as { errors?: unknown[] } | undefined;
        logger.error('Salesforce API error', { status, data });

        if (status === SALESFORCE_STATUS_CODES.TOO_MANY_REQUESTS) {
          throw new SalesforceRateLimitError('Salesforce rate limit exceeded');
        }
        if (status && status >= 500) {
          throw new RetryableProcessingError(`Salesforce server error: ${status}`);
        }
        if (status === SALESFORCE_STATUS_CODES.BAD_REQUEST) {
          throw new SalesforceValidationError('Salesforce validation failed', Array.isArray(data?.errors) ? data.errors : [data]);
        }
        if (status && status >= 400) {
          throw new SalesforceValidationError(`Salesforce client error: ${status}`);
        }
      }

      throw error;
    }
  }
}

export const salesforceRepository = new SalesforceRepository();
