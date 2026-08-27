import { getConfigValue } from '../../util/config.js';

let cachedFlag: { value: boolean; fetchedAt: number } | undefined;
const parsedTtl = Number(process.env.SQS_DELIVERY_FLAG_TTL_MS);
const FLAG_TTL_MS = Number.isFinite(parsedTtl) ? parsedTtl : 60000;

export async function isSqsDeliveryEnabled(): Promise<boolean> {
  if (cachedFlag && Date.now() - cachedFlag.fetchedAt < FLAG_TTL_MS) {
    return cachedFlag.value;
  }
  const raw: string = await getConfigValue(process.env.ENABLE_SQS_DELIVERY ?? '');
  const value = String(raw).trim().toLowerCase() === 'true';
  cachedFlag = { value, fetchedAt: Date.now() };
  return value;
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
