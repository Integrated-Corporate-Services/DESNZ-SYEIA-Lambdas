import {
  hasGovPayApiCredentialsConfigured,
  isGovPayApiValidationEnabled,
  resetGovPayConfigCache,
  resolveGovPayConfig,
} from '../../src/util/govPayConfig.js';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: mockSend })),
  GetParameterCommand: jest.fn((input) => input),
}));

describe('govPayConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetGovPayConfigCache();
    mockSend.mockReset();
    delete process.env.GOVUK_API_KEY;
    delete process.env.GOVPAY_API_KEY;
    delete process.env.GOVPAY_API_KEY_PARAMETER;
    delete process.env.EXTERNAL_API_BASE_URL_PARAMETER;
    delete process.env.GOVPAY_API_URL;
    delete process.env.GOVPAY_API_VALIDATION_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('hasGovPayApiCredentialsConfigured is true when GOVPAY_API_KEY is set', () => {
    process.env.GOVPAY_API_KEY = 'test-key';
    expect(hasGovPayApiCredentialsConfigured()).toBe(true);
  });

  test('hasGovPayApiCredentialsConfigured is true when GOVPAY_API_KEY_PARAMETER is set', () => {
    process.env.GOVPAY_API_KEY_PARAMETER = '/dev/govpay/api-key';
    expect(hasGovPayApiCredentialsConfigured()).toBe(true);
  });

  test('isGovPayApiValidationEnabled is false when explicitly disabled', () => {
    process.env.GOVPAY_API_KEY = 'test-key';
    process.env.GOVPAY_API_VALIDATION_ENABLED = 'false';
    expect(isGovPayApiValidationEnabled()).toBe(false);
  });

  test('isGovPayApiValidationEnabled is false without credentials', () => {
    expect(isGovPayApiValidationEnabled()).toBe(false);
  });

  test('isGovPayApiValidationEnabled is true when credentials are configured', () => {
    process.env.GOVPAY_API_KEY = 'test-key';
    expect(isGovPayApiValidationEnabled()).toBe(true);
  });

  test('resolveGovPayConfig reads direct env vars', async () => {
    process.env.GOVPAY_API_KEY = 'direct-key';
    process.env.GOVPAY_API_URL = 'https://example.test/v1/payments/';

    const config = await resolveGovPayConfig();

    expect(config.apiKey).toBe('direct-key');
    expect(config.apiUrl).toBe('https://example.test/v1/payments');
  });

  test('resolveGovPayConfig throws when API key is missing', async () => {
    await expect(resolveGovPayConfig()).rejects.toThrow('GOV.UK Pay API key not configured');
  });

  test('resolveGovPayConfig fetches API key from SSM when parameter path is set', async () => {
    process.env.GOVPAY_API_KEY_PARAMETER = '/dev/govpay/api-key';
    mockSend.mockResolvedValue({ Parameter: { Value: 'ssm-api-key' } });

    const config = await resolveGovPayConfig();

    expect(config.apiKey).toBe('ssm-api-key');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Name: '/dev/govpay/api-key', WithDecryption: true })
    );
  });

  test('resolveGovPayConfig uses literal parameter value when not an SSM path', async () => {
    process.env.GOVPAY_API_KEY_PARAMETER = 'inline-api-key-value';

    const config = await resolveGovPayConfig();

    expect(config.apiKey).toBe('inline-api-key-value');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('resolveGovPayConfig fetches API URL from SSM EXTERNAL_API_BASE_URL_PARAMETER', async () => {
    process.env.GOVPAY_API_KEY = 'direct-key';
    process.env.EXTERNAL_API_BASE_URL_PARAMETER = '/dev/govpay/api-url';
    mockSend.mockResolvedValue({
      Parameter: { Value: 'https://custom.api.test/v1/payments/' },
    });

    const config = await resolveGovPayConfig();

    expect(config.apiUrl).toBe('https://custom.api.test/v1/payments');
  });
});
