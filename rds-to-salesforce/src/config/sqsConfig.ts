/**
 * SQS delivery feature configuration
 * Centralizes env/flag access for the ENABLE_SQS_DELIVERY feature, mirroring
 * rds-to-salesforce-worker/src/config/env.config.ts
 *
 * Reuses the existing util/config.js SSM/config resolution rather than
 * standing up parallel config infrastructure.
 */
import { getConfigValue } from '../../util/config.js';

/**
 * Feature flag - defaults to false. When false/unset, outboxService.js's
 * existing DIRECT/APPFLOW logic runs completely unchanged. Only when this
 * resolves to true does processJob route to the src/ SQS delivery logic.
 */
export async function isSqsDeliveryEnabled(): Promise<boolean> {
  const raw: string = await getConfigValue(process.env.ENABLE_SQS_DELIVERY ?? '');
  return String(raw).trim().toLowerCase() === 'true';
}

export const AWS_CONFIG = {
  region: process.env.REGION,
};

export function getSalesforceEventsQueueUrl(): string {
  const url = process.env.SALESFORCE_EVENTS_QUEUE_URL;
  if (!url) {
    throw new Error('SALESFORCE_EVENTS_QUEUE_URL is not configured');
  }
  return url;
}
