import {
  isGovPayApiValidationEnabled,
  normalizePaymentsApiUrl,
  resetGovPayConfigCache,
  resolveGovPayConfig,
} from '../../src/util/govPayConfig.js';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({ send: mockSend })),
  GetParameterCommand: jest.fn((input) => input),
}));

jest.mock('../../src/util/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('govPayConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetGovPayConfigCache();
    mockSend.mockReset();
    delete process.env.GOVPAY_API_VALIDATION_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function mockSsmParameters(apiKey: string, apiUrl: string): void {
    mockSend.mockImplementation(async (input: { Name: string }) => {
      if (input.Name === '/GOVPAY/API/KEY') {
        return { Parameter: { Value: apiKey } };
      }
      if (input.Name === '/GOVPAY/EXTERNAL/API/BASE/URL') {
        return { Parameter: { Value: apiUrl } };
      }
      throw new Error(`Unknown parameter: ${input.Name}`);
    });
  }

  test('normalizePaymentsApiUrl appends /v1/payments when SSM stores host-only URL', () => {
    expect(normalizePaymentsApiUrl('https://publicapi.payments.service.gov.uk')).toBe(
      'https://publicapi.payments.service.gov.uk/v1/payments'
    );
    expect(normalizePaymentsApiUrl('https://example.test/v1/payments/')).toBe(
      'https://example.test/v1/payments'
    );
  });

  test('isGovPayApiValidationEnabled is false when explicitly disabled', () => {
    process.env.GOVPAY_API_VALIDATION_ENABLED = 'false';
    expect(isGovPayApiValidationEnabled()).toBe(false);
  });

  test('isGovPayApiValidationEnabled is true by default', () => {
    expect(isGovPayApiValidationEnabled()).toBe(true);
  });

  test('resolveGovPayConfig fetches /GOVPAY/API/KEY and /GOVPAY/EXTERNAL/API/BASE/URL from SSM', async () => {
    mockSsmParameters('ssm-api-key', 'https://publicapi.payments.service.gov.uk');

    const config = await resolveGovPayConfig();

    expect(config.apiKey).toBe('ssm-api-key');
    expect(config.apiUrl).toBe('https://publicapi.payments.service.gov.uk/v1/payments');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Name: '/GOVPAY/API/KEY', WithDecryption: true })
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Name: '/GOVPAY/EXTERNAL/API/BASE/URL', WithDecryption: true })
    );
  });

  test('resolveGovPayConfig returns cached config on subsequent calls', async () => {
    mockSsmParameters('cached-key', 'https://cached.test/v1/payments');

    await resolveGovPayConfig();
    await resolveGovPayConfig();

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('resolveGovPayConfig throws when /GOVPAY/API/KEY SSM fetch fails', async () => {
    mockSend.mockRejectedValue(new Error('AccessDeniedException'));

    await expect(resolveGovPayConfig()).rejects.toThrow(
      "Failed to fetch SSM parameter '/GOVPAY/API/KEY'"
    );
  });

  test('resolveGovPayConfig throws when /GOVPAY/EXTERNAL/API/BASE/URL has no value', async () => {
    mockSend.mockImplementation(async (input: { Name: string }) => {
      if (input.Name === '/GOVPAY/API/KEY') {
        return { Parameter: { Value: 'ssm-api-key' } };
      }
      return { Parameter: { Value: '' } };
    });

    await expect(resolveGovPayConfig()).rejects.toThrow(
      "SSM parameter '/GOVPAY/EXTERNAL/API/BASE/URL' has no value"
    );
  });
});
