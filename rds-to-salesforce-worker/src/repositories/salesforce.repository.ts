import axios, { AxiosInstance, AxiosError } from 'axios';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SALESFORCE_CONFIG, AWS_CONFIG } from '../config/env.config';
import { createLogger } from '../util/logger';
import { 
  SalesforceAuthError, 
  SalesforceRateLimitError, 
  SalesforceValidationError 
} from '../errors';
import type { SalesforceCredentials, SalesforceApiResponse } from '../types';
import { SALESFORCE_STATUS_CODES } from '../constants';

const logger = createLogger('salesforce.repository');

interface CredentialsCache {
  credentials: SalesforceCredentials;
  fetchedAt: number;
}

let credentialsCache: CredentialsCache | null = null;
let axiosInstance: AxiosInstance | null = null;

/**
 * Fetch Salesforce credentials from AWS Secrets Manager
 */
async function getSalesforceCredentials(): Promise<SalesforceCredentials> {
  const now = Date.now();

  // Return cached credentials if still valid
  if (credentialsCache && (now - credentialsCache.fetchedAt) < SALESFORCE_CONFIG.secretTtlMs) {
    logger.debug('Using cached Salesforce credentials');
    return credentialsCache.credentials;
  }

  try {
    const client = new SecretsManagerClient({
      region: AWS_CONFIG.region,
      endpoint: AWS_CONFIG.endpoint,
    });

    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: SALESFORCE_CONFIG.secretName,
      })
    );

    if (!response.SecretString) {
      throw new SalesforceAuthError('Salesforce secret not found or empty');
    }

    const credentials = JSON.parse(response.SecretString) as SalesforceCredentials;

    if (!credentials.instanceUrl || !credentials.accessToken) {
      throw new SalesforceAuthError('Invalid Salesforce credentials structure');
    }

    credentialsCache = {
      credentials,
      fetchedAt: now,
    };

    logger.info('Fetched Salesforce credentials from Secrets Manager');
    return credentials;
  } catch (error) {
    logger.error('Failed to fetch Salesforce credentials', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SalesforceAuthError(`Failed to retrieve Salesforce credentials: ${error}`);
  }
}

/**
 * Get Axios instance configured with Salesforce credentials
 */
async function getSalesforceAxiosInstance(): Promise<AxiosInstance> {
  if (axiosInstance) {
    return axiosInstance;
  }

  const credentials = await getSalesforceCredentials();

  axiosInstance = axios.create({
    baseURL: credentials.instanceUrl,
    timeout: SALESFORCE_CONFIG.timeout,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  // Response interceptor for token refresh
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (error.response?.status === SALESFORCE_STATUS_CODES.UNAUTHORIZED) {
        // Token expired, clear cache and retry once
        credentialsCache = null;
        axiosInstance = null;
        logger.warn('Salesforce token expired, refreshing...');
      }
      return Promise.reject(error);
    }
  );

  return axiosInstance;
}

/**
 * Salesforce API Repository
 * Handles all Salesforce API operations
 */
class SalesforceRepository {
  /**
   * Create a new Salesforce object
   */
  async createObject(sobjectType: string, data: Record<string, unknown>): Promise<SalesforceApiResponse> {
    try {
      const client = await getSalesforceAxiosInstance();
      const response = await client.post(`/services/data/v60.0/sobjects/${sobjectType}`, data);

      logger.info('Salesforce CREATE successful', {
        sobjectType,
        id: response.data.id,
      });

      return {
        success: true,
        id: response.data.id,
      };
    } catch (error) {
      return this.handleSalesforceError(error, 'CREATE', sobjectType);
    }
  }

  /**
   * Update an existing Salesforce object
   */
  async updateObject(
    sobjectType: string, 
    salesforceId: string, 
    data: Record<string, unknown>
  ): Promise<SalesforceApiResponse> {
    try {
      const client = await getSalesforceAxiosInstance();
      await client.patch(`/services/data/v60.0/sobjects/${sobjectType}/${salesforceId}`, data);

      logger.info('Salesforce UPDATE successful', {
        sobjectType,
        salesforceId,
      });

      return {
        success: true,
        id: salesforceId,
      };
    } catch (error) {
      return this.handleSalesforceError(error, 'UPDATE', sobjectType);
    }
  }

  /**
   * Upsert a Salesforce object (create or update based on external ID)
   */
  async upsertObject(
    sobjectType: string,
    externalIdField: string,
    externalIdValue: string,
    data: Record<string, unknown>
  ): Promise<SalesforceApiResponse> {
    try {
      const client = await getSalesforceAxiosInstance();
      const response = await client.patch(
        `/services/data/v60.0/sobjects/${sobjectType}/${externalIdField}/${externalIdValue}`,
        data
      );

      logger.info('Salesforce UPSERT successful', {
        sobjectType,
        externalIdField,
        externalIdValue,
        id: response.data.id,
      });

      return {
        success: true,
        id: response.data.id || externalIdValue,
      };
    } catch (error) {
      return this.handleSalesforceError(error, 'UPSERT', sobjectType);
    }
  }

  /**
   * Delete a Salesforce object
   */
  async deleteObject(sobjectType: string, salesforceId: string): Promise<SalesforceApiResponse> {
    try {
      const client = await getSalesforceAxiosInstance();
      await client.delete(`/services/data/v60.0/sobjects/${sobjectType}/${salesforceId}`);

      logger.info('Salesforce DELETE successful', {
        sobjectType,
        salesforceId,
      });

      return {
        success: true,
        id: salesforceId,
      };
    } catch (error) {
      return this.handleSalesforceError(error, 'DELETE', sobjectType);
    }
  }

  /**
   * Handle Salesforce API errors
   */
  private handleSalesforceError(
    error: unknown,
    operation: string,
    sobjectType: string
  ): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Salesforce API error', {
        operation,
        sobjectType,
        status,
        error: errorData,
      });

      // Rate limit error (429) - retryable
      if (status === SALESFORCE_STATUS_CODES.TOO_MANY_REQUESTS) {
        const retryAfter = error.response?.headers['retry-after'];
        throw new SalesforceRateLimitError(
          `Salesforce rate limit exceeded for ${operation}`,
          retryAfter ? parseInt(retryAfter) : undefined
        );
      }

      // Validation errors (400) - non-retryable
      if (status === SALESFORCE_STATUS_CODES.BAD_REQUEST) {
        throw new SalesforceValidationError(
          `Salesforce validation failed for ${operation}`,
          errorData?.errors || [errorData]
        );
      }

      // Server errors (500, 503) - retryable
      if (status && status >= 500) {
        throw new Error(`Salesforce server error: ${status}`);
      }

      // Client errors (401, 403, 404) - non-retryable
      if (status && status >= 400 && status < 500) {
        throw new SalesforceValidationError(
          `Salesforce client error: ${status} - ${errorData?.message || error.message}`
        );
      }
    }

    // Network/timeout errors - retryable
    if (error instanceof Error) {
      if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET')) {
        throw new Error(`Salesforce network error: ${error.message}`);
      }
    }

    throw new Error(`Unexpected Salesforce error: ${error}`);
  }
}

export const salesforceRepository = new SalesforceRepository();
