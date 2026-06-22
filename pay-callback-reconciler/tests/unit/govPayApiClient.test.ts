import { getPaymentById } from '../../src/services/govPayApiClient.js';
import { resetGovPayConfigCache } from '../../src/util/govPayConfig.js';

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

const originalFetch = global.fetch;

describe('govPayApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGovPayConfigCache();
    mockSend.mockImplementation(async (input: { Name: string }) => {
      if (input.Name === 'GOVPAY_API_KEY') {
        return { Parameter: { Value: 'test-api-key' } };
      }
      if (input.Name === 'GOVPAY_API_URL') {
        return { Parameter: { Value: 'https://publicapi.payments.service.gov.uk/v1/payments' } };
      }
      throw new Error(`Unknown parameter: ${input.Name}`);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetGovPayConfigCache();
  });

  test('rejects invalid payment ID format (SSRF guard)', async () => {
    await expect(getPaymentById('../evil')).rejects.toThrow('Invalid GOV.UK Pay payment ID format');
    await expect(getPaymentById('id/with/slash')).rejects.toThrow('Invalid GOV.UK Pay payment ID format');
  });

  test('fetches payment with Bearer auth and returns parsed JSON', async () => {
    const mockPayment = {
      payment_id: 'ssci1bmuo1s8sbbmnoih34otg9',
      amount: 10000,
      state: { status: 'success', finished: true },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayment,
    }) as unknown as typeof fetch;

    const result = await getPaymentById('ssci1bmuo1s8sbbmnoih34otg9');

    expect(result).toEqual(mockPayment);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://publicapi.payments.service.gov.uk/v1/payments/ssci1bmuo1s8sbbmnoih34otg9',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-api-key',
          Accept: 'application/json',
        },
      })
    );
  });

  test('throws on non-2xx API response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '{"message":"Payment not found"}',
    }) as unknown as typeof fetch;

    await expect(getPaymentById('missing_payment_id')).rejects.toThrow(
      'GOV.UK Pay API error (404): Not Found'
    );
  });

  test('throws timeout error when request is aborted', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    await expect(getPaymentById('pay_timeout_test')).rejects.toThrow(
      'GOV.UK Pay API request timed out for payment_id=pay_timeout_test'
    );
  });

  test('accepts real GOV.UK Pay payment ID formats', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payment_id: '0mpk90vhn628qufblenemc2op8',
        amount: 5000,
        state: { status: 'success' },
      }),
    }) as unknown as typeof fetch;

    await expect(getPaymentById('0mpk90vhn628qufblenemc2op8')).resolves.toMatchObject({
      payment_id: '0mpk90vhn628qufblenemc2op8',
    });
  });
});
