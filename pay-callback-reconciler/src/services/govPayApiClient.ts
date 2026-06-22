import log from '../util/logger.js';
import { resolveGovPayConfig } from '../util/govPayConfig.js';
import type { GovPayPaymentResponse } from '../types/govPay.types.js';

const PAYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function getPaymentById(paymentId: string): Promise<GovPayPaymentResponse> {
  if (!PAYMENT_ID_PATTERN.test(paymentId)) {
    throw new Error(`Invalid GOV.UK Pay payment ID format: ${paymentId}`);
  }

  const { apiKey, apiUrl } = await resolveGovPayConfig();
  const url = `${apiUrl}/${paymentId}`;

  log.info('[govPayApiClient] Fetching payment from GOV.UK Pay', { paymentId });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error('[govPayApiClient] GOV.UK Pay API error', {
        paymentId,
        status: response.status,
        statusText: response.statusText,
        errorBody,
      });
      throw new Error(
        `GOV.UK Pay API error (${response.status}): ${response.statusText}`
      );
    }

    const result = (await response.json()) as GovPayPaymentResponse;

    log.info('[govPayApiClient] GOV.UK Pay payment fetched', {
      paymentId: result.payment_id,
      apiStatus: result.state?.status,
    });

    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`GOV.UK Pay API request timed out for payment_id=${paymentId}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
