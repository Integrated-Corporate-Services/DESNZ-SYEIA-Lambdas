import { getConfigValue } from '../../util/config.js';

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
