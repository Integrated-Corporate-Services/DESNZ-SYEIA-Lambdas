import {
  getGovukPayWebhookSecret,
  hasGovukPayWebhookSecretConfigured,
} from '../../src/util/webhookSecret.js';

describe('webhookSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GOVUK_PAY_WEBHOOK_SECRET;
    delete process.env.GOVPAY_WEBHOOK_SIGNING_KEY;
    delete process.env.GOVPAY_CALLBACK_SIGNING_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('reads GOVUK_PAY_WEBHOOK_SECRET', () => {
    process.env.GOVUK_PAY_WEBHOOK_SECRET = 'secret-a';
    expect(getGovukPayWebhookSecret()).toBe('secret-a');
    expect(hasGovukPayWebhookSecretConfigured()).toBe(true);
  });

  test('reads GOVPAY_WEBHOOK_SIGNING_KEY when primary secret is unset', () => {
    process.env.GOVPAY_WEBHOOK_SIGNING_KEY = 'secret-b';
    expect(getGovukPayWebhookSecret()).toBe('secret-b');
  });

  test('prefers GOVUK_PAY_WEBHOOK_SECRET over aliases', () => {
    process.env.GOVUK_PAY_WEBHOOK_SECRET = 'primary';
    process.env.GOVPAY_WEBHOOK_SIGNING_KEY = 'alias';
    expect(getGovukPayWebhookSecret()).toBe('primary');
  });

  test('returns undefined when no signing secret env vars are set', () => {
    expect(getGovukPayWebhookSecret()).toBeUndefined();
    expect(hasGovukPayWebhookSecretConfigured()).toBe(false);
  });
});
