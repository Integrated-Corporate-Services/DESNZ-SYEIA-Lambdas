import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { getAwsRegion } from './dbConfig.js';

const DEFAULT_API_URL = 'https://publicapi.payments.service.gov.uk/v1/payments';
const API_KEY_ENV_NAMES = ['GOVUK_API_KEY', 'GOVPAY_API_KEY'] as const;
const API_URL_ENV_NAMES = ['GOVPAY_API_URL', 'GOVUK_API_URL'] as const;

interface GovPayConfig {
  apiKey: string;
  apiUrl: string;
}

let cachedConfig: GovPayConfig | null = null;

export function resetGovPayConfigCache(): void {
  cachedConfig = null;
}

function readDirectEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function isSsmParameterRef(value: string): boolean {
  return value.startsWith('arn:aws:ssm:') || value.startsWith('/');
}

async function fetchSsmParameter(nameOrArn: string): Promise<string> {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  const client = new SSMClient({
    region: getAwsRegion(),
    ...(endpoint ? { endpoint } : {}),
  });

  const response = await client.send(
    new GetParameterCommand({ Name: nameOrArn, WithDecryption: true })
  );

  const value = response.Parameter?.Value?.trim();
  if (!value) {
    throw new Error(`SSM parameter ${nameOrArn} has no value`);
  }

  return value;
}

async function resolveConfigValue(
  directEnvNames: readonly string[],
  parameterEnvName: string
): Promise<string | undefined> {
  const direct = readDirectEnv(directEnvNames);
  if (direct) {
    return direct;
  }

  const parameterRef = process.env[parameterEnvName]?.trim();
  if (!parameterRef) {
    return undefined;
  }

  if (isSsmParameterRef(parameterRef)) {
    return fetchSsmParameter(parameterRef);
  }

  return parameterRef;
}

export function hasGovPayApiCredentialsConfigured(): boolean {
  if (readDirectEnv(API_KEY_ENV_NAMES)) {
    return true;
  }

  return Boolean(process.env.GOVPAY_API_KEY_PARAMETER?.trim());
}

export function isGovPayApiValidationEnabled(): boolean {
  if (process.env.GOVPAY_API_VALIDATION_ENABLED === 'false') {
    return false;
  }

  return hasGovPayApiCredentialsConfigured();
}

export async function resolveGovPayConfig(): Promise<GovPayConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const apiKey = await resolveConfigValue(API_KEY_ENV_NAMES, 'GOVPAY_API_KEY_PARAMETER');
  if (!apiKey) {
    throw new Error(
      'GOV.UK Pay API key not configured (GOVUK_API_KEY|GOVPAY_API_KEY|GOVPAY_API_KEY_PARAMETER)'
    );
  }

  const apiUrl =
    (await resolveConfigValue(API_URL_ENV_NAMES, 'EXTERNAL_API_BASE_URL_PARAMETER')) ??
    DEFAULT_API_URL;

  cachedConfig = { apiKey, apiUrl: apiUrl.replace(/\/$/, '') };
  return cachedConfig;
}
