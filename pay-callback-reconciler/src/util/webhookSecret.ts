/**
 * Resolve GOV.UK Pay webhook signing secret from environment.
 * Accepts the same names used by inbound-event-receiver (ECS) and LocalStack.
 */
const WEBHOOK_SECRET_ENV_KEYS = [
  'GOVUK_PAY_WEBHOOK_SECRET',
  'GOVPAY_WEBHOOK_SIGNING_KEY',
  'GOVPAY_CALLBACK_SIGNING_SECRET',
] as const;

export const WEBHOOK_SECRET_ENV_ALIASES = WEBHOOK_SECRET_ENV_KEYS.join('|');

export function getGovukPayWebhookSecret(): string | undefined {
  for (const key of WEBHOOK_SECRET_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function hasGovukPayWebhookSecretConfigured(): boolean {
  return Boolean(getGovukPayWebhookSecret());
}
