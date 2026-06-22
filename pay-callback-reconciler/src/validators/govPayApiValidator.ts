import log from '../util/logger.js';
import { getPaymentById } from '../services/govPayApiClient.js';
import { isGovPayApiValidationEnabled } from '../util/govPayConfig.js';
import type { GovPayPaymentResponse } from '../types/govPay.types.js';

/** Webhook event_type → acceptable GOV.UK Pay API state.status values */
const WEBHOOK_TO_API_STATUSES: Record<string, string[]> = {
  card_payment_succeeded: ['success', 'submitted', 'capturable'],
  card_payment_captured: ['success'],
  card_payment_settled: ['success'],
  card_payment_failed: ['failed'],
  card_payment_expired: ['expired', 'timedout', 'cancelled'],
  card_payment_cancelled: ['cancelled', 'failed'],
  card_payment_refunded: ['success'],
  card_payment_started: ['started', 'submitted', 'created'],
  card_payment_created: ['created', 'started'],
};

export { isGovPayApiValidationEnabled };

export function assertWebhookMatchesGovPayApi(
  webhookEventType: string,
  apiPayment: GovPayPaymentResponse,
  expectedPaymentId: string,
  webhookAmount?: number
): void {
  if (apiPayment.payment_id !== expectedPaymentId) {
    throw new Error(
      `GOV.UK API payment_id mismatch: expected ${expectedPaymentId}, got ${apiPayment.payment_id}`
    );
  }

  const allowedStatuses = WEBHOOK_TO_API_STATUSES[webhookEventType];
  const apiStatus = apiPayment.state?.status?.toLowerCase();

  if (!allowedStatuses) {
    log.warn('[govPayApiValidator] No API status mapping for webhook event type — skipping status check', {
      webhookEventType,
      apiStatus,
    });
    return;
  }

  if (!apiStatus || !allowedStatuses.includes(apiStatus)) {
    throw new Error(
      `GOV.UK API status '${apiStatus ?? 'unknown'}' does not match webhook '${webhookEventType}'`
    );
  }

  if (
    webhookAmount !== undefined &&
    apiPayment.amount !== undefined &&
    apiPayment.amount !== webhookAmount
  ) {
    throw new Error(
      `GOV.UK API amount mismatch: webhook ${webhookAmount}, API ${apiPayment.amount}`
    );
  }
}

export async function validateWebhookWithGovPayApi(params: {
  paymentId: string;
  webhookEventType: string;
  webhookAmount?: number;
}): Promise<GovPayPaymentResponse> {
  const apiPayment = await getPaymentById(params.paymentId);
  assertWebhookMatchesGovPayApi(
    params.webhookEventType,
    apiPayment,
    params.paymentId,
    params.webhookAmount
  );

  log.info('[govPayApiValidator] Webhook validated against GOV.UK Pay API', {
    paymentId: params.paymentId,
    webhookEventType: params.webhookEventType,
    apiStatus: apiPayment.state?.status,
  });

  return apiPayment;
}
