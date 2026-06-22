import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ENV_KEYS } from '../constants/payment.constants.js';
import { getAwsRegion } from './dbConfig.js';
import log from './logger.js';

/**
 * SSM Parameter Store paths for GOV.UK Pay REST API credentials.
 * Same secrets as payment-service / backend (GOVPAY_API_KEY + GOVPAY_API_URL).
 */
const SSM_PARAMETER_NAMES = {
  API_KEY: ENV_KEYS.GOVPAY_API_KEY,
  API_URL: ENV_KEYS.GOVPAY_API_URL,
} as const;

interface GovPayConfig {
  apiKey: string;
  apiUrl: string;
}

let cachedConfig: GovPayConfig | null = null;

export function resetGovPayConfigCache(): void {
  cachedConfig = null;
}

/** Ensures GET /v1/payments/{id} base path — SSM may store host-only URL. */
export function normalizePaymentsApiUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/v1/payments')) {
    return trimmed;
  }
  return `${trimmed}/v1/payments`;
}

async function fetchSsmParameter(parameterName: string): Promise<string> {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const client = new SSMClient({
    region: getAwsRegion(),
    ...(endpoint ? { endpoint } : {}),
  });

  try {
    const response = await client.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true })
    );

    const value = response.Parameter?.Value?.trim();
    if (!value) {
      log.error('[govPayConfig] SSM parameter has no value', { parameterName });
      throw new Error(`SSM parameter '${parameterName}' has no value`);
    }

    log.info('[govPayConfig] Successfully fetched SSM parameter', { parameterName });
    return value;
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('has no value')) {
      throw error;
    }

    log.error('[govPayConfig] Failed to fetch SSM parameter', {
      parameterName,
      error: error.message,
    });
    throw new Error(`Failed to fetch SSM parameter '${parameterName}': ${error.message}`);
  }
}

export function isGovPayApiValidationEnabled(): boolean {
  return process.env[ENV_KEYS.GOVPAY_API_VALIDATION_ENABLED] !== 'false';
}

export async function resolveGovPayConfig(): Promise<GovPayConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const [apiKey, apiUrlRaw] = await Promise.all([
    fetchSsmParameter(SSM_PARAMETER_NAMES.API_KEY),
    fetchSsmParameter(SSM_PARAMETER_NAMES.API_URL),
  ]);

  const apiUrl = normalizePaymentsApiUrl(apiUrlRaw);
  cachedConfig = { apiKey, apiUrl };
  log.info('[govPayConfig] GOV.UK Pay API configuration loaded from Parameter Store', {
    apiKeyParameter: SSM_PARAMETER_NAMES.API_KEY,
    apiUrlParameter: SSM_PARAMETER_NAMES.API_URL,
    apiUrl,
  });

  return cachedConfig;
}
