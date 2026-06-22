import {
  assertWebhookMatchesGovPayApi,
  validateWebhookWithGovPayApi,
} from '../../src/validators/govPayApiValidator.js';
import { getPaymentById } from '../../src/services/govPayApiClient.js';
import type { GovPayPaymentResponse } from '../../src/types/govPay.types.js';

jest.mock('../../src/services/govPayApiClient.js');
jest.mock('../../src/util/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockGetPaymentById = getPaymentById as jest.MockedFunction<typeof getPaymentById>;

const baseApiPayment: GovPayPaymentResponse = {
  payment_id: 'pay_flow_001',
  amount: 10000,
  state: { status: 'success', finished: true },
};

describe('govPayApiValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assertWebhookMatchesGovPayApi', () => {
    test('accepts card_payment_succeeded when API status is success', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_succeeded',
          baseApiPayment,
          'pay_flow_001',
          10000
        )
      ).not.toThrow();
    });

    test('rejects payment_id mismatch', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_succeeded',
          { ...baseApiPayment, payment_id: 'other_id' },
          'pay_flow_001'
        )
      ).toThrow('payment_id mismatch');
    });

    test('rejects status mismatch for card_payment_failed', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_failed',
          { ...baseApiPayment, state: { status: 'success' } },
          'pay_flow_001'
        )
      ).toThrow("does not match webhook 'card_payment_failed'");
    });

    test('rejects amount mismatch when both amounts are present', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_succeeded',
          baseApiPayment,
          'pay_flow_001',
          5000
        )
      ).toThrow('amount mismatch');
    });

    test('accepts uppercase API status (normalised to lowercase)', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_succeeded',
          { ...baseApiPayment, state: { status: 'SUCCESS' } },
          'pay_flow_001'
        )
      ).not.toThrow();
    });

    test('rejects when API state is missing', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_succeeded',
          { ...baseApiPayment, state: undefined },
          'pay_flow_001'
        )
      ).toThrow("GOV.UK API status 'unknown'");
    });

    test('skips status check for unmapped webhook event types', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_unknown_event',
          { ...baseApiPayment, state: { status: 'weird' } },
          'pay_flow_001'
        )
      ).not.toThrow();
    });

    test('allows card_payment_captured when API status is success', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_captured',
          baseApiPayment,
          'pay_flow_001'
        )
      ).not.toThrow();
    });

    test('allows card_payment_failed when API status is failed', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi(
          'card_payment_failed',
          { ...baseApiPayment, state: { status: 'failed' } },
          'pay_flow_001'
        )
      ).not.toThrow();
    });

    test('skips amount check when webhook amount is omitted', () => {
      expect(() =>
        assertWebhookMatchesGovPayApi('card_payment_succeeded', baseApiPayment, 'pay_flow_001')
      ).not.toThrow();
    });
  });

  describe('validateWebhookWithGovPayApi', () => {
    test('fetches payment and validates webhook payload', async () => {
      mockGetPaymentById.mockResolvedValue(baseApiPayment);

      const result = await validateWebhookWithGovPayApi({
        paymentId: 'pay_flow_001',
        webhookEventType: 'card_payment_succeeded',
        webhookAmount: 10000,
      });

      expect(mockGetPaymentById).toHaveBeenCalledWith('pay_flow_001');
      expect(result.payment_id).toBe('pay_flow_001');
    });

    test('propagates API fetch errors', async () => {
      mockGetPaymentById.mockRejectedValue(new Error('GOV.UK Pay API error (404): Not Found'));

      await expect(
        validateWebhookWithGovPayApi({
          paymentId: 'pay_flow_001',
          webhookEventType: 'card_payment_succeeded',
        })
      ).rejects.toThrow('GOV.UK Pay API error (404)');
    });
  });
});
