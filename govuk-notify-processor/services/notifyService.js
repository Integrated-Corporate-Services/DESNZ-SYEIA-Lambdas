/**
 * GOV.UK Notify API Service
 * 
 * Sends emails via GOV.UK Notify API
 * - Retry logic with exponential backoff
 * - Error classification (retryable vs permanent)
 * - API key from Secrets Manager
 */

import axios from 'axios';
import { getSecret } from '../util/secrets.js';
import log from '../util/logger.js';
import { sleep } from '../util/helpers.js';

const NOTIFY_API_BASE_URL = process.env.NOTIFY_API_URL || 'https://api.notifications.service.gov.uk';
const NOTIFY_API_TIMEOUT = parseInt(process.env.NOTIFY_API_TIMEOUT || '10000');
const MAX_RETRIES = parseInt(process.env.NOTIFY_MAX_RETRIES || '3');
const INITIAL_BACKOFF_MS = parseInt(process.env.NOTIFY_BACKOFF_MS || '2000');

// Cached API key
let cachedApiKey = null;
let apiKeyLastFetched = null;
const API_KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Send email via GOV.UK Notify API with retry logic
 * @param {string} emailAddress - Recipient email
 * @param {string} templateId - Template UUID
 * @param {object} personalisation - Template variables
 * @param {string} reference - Unique reference for idempotency
 * @param {string} correlationId - Correlation ID for tracing
 * @returns {Promise<object>} - { notificationId, status }
 */
export async function sendEmailViaNotify(
  emailAddress,
  templateId,
  personalisation,
  reference,
  correlationId
) {
  let lastError = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt;
    const attemptStartTime = Date.now();

    try {
      log.info('[notifyService] Attempting to send email', {
        correlationId,
        attempt,
        maxRetries: MAX_RETRIES,
        templateId,
        reference,
      });

      // Get API key
      const apiKey = await getNotifyApiKey();

      // Build request payload
      const payload = {
        email_address: emailAddress,
        template_id: templateId,
        personalisation: personalisation || {},
      };

      if (reference) {
        payload.reference = reference;
      }

      // Call Notify API
      const response = await axios.post(
        `${NOTIFY_API_BASE_URL}/v2/notifications/email`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: NOTIFY_API_TIMEOUT,
        }
      );

      const duration = Date.now() - attemptStartTime;
      const notificationId = response.data?.id;

      log.info('[notifyService] Email sent successfully', {
        correlationId,
        notificationId,
        reference,
        attempt,
        duration,
        statusCode: response.status,
      });

      return {
        notificationId,
        status: response.data?.status || 'sent',
        uri: response.data?.uri,
      };

    } catch (error) {
      lastError = error;
      const duration = Date.now() - attemptStartTime;
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      log.warn('[notifyService] Email send attempt failed', {
        correlationId,
        attempt,
        statusCode,
        errorCode: error.code,
        errorMessage: error.message,
        errorData,
        duration,
      });

      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      // If this is the last attempt or error is not retryable, don't continue
      if (attempt >= MAX_RETRIES || !isRetryable) {
        log.error('[notifyService] Max retries reached or permanent error', {
          correlationId,
          attempt,
          isRetryable,
          statusCode,
          error: error.message,
        });
        break;
      }

      // Handle rate limiting
      if (statusCode === 429) {
        const retryAfter = error.response?.headers['retry-after'];
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : INITIAL_BACKOFF_MS;

        log.warn('[notifyService] Rate limited - waiting before retry', {
          correlationId,
          retryAfter,
          waitMs,
        });

        await sleep(Math.min(waitMs, 30000));
        continue;
      }

      // Exponential backoff
      const backoffMs = Math.min(
        INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1),
        30000
      );

      log.info('[notifyService] Waiting before retry', {
        correlationId,
        attempt,
        backoffMs,
      });

      await sleep(backoffMs);
    }
  }

  // All retries failed
  const finalError = new Error(
    lastError?.response?.data?.errors?.[0]?.message ||
    lastError?.message ||
    'Failed to send email after retries'
  );
  
  finalError.statusCode = lastError?.response?.status;
  finalError.code = lastError?.code;
  finalError.isRetryable = isRetryableError(lastError);
  finalError.attempts = attempts;

  throw finalError;
}

/**
 * Get GOV.UK Notify API key from cache or Secrets Manager
 */
async function getNotifyApiKey() {
  const now = Date.now();

  // Return cached key if valid
  if (cachedApiKey && apiKeyLastFetched && (now - apiKeyLastFetched) < API_KEY_CACHE_TTL) {
    return cachedApiKey;
  }

  // Fetch from Secrets Manager
  const secretName = process.env.NOTIFY_API_KEY_SECRET || '/notify/api-key';
  const secret = await getSecret(secretName);

  // Parse secret
  let apiKey;
  try {
    const parsed = JSON.parse(secret);
    apiKey = parsed.api_key || parsed.apiKey || parsed.key;
  } catch {
    apiKey = secret;
  }

  if (!apiKey) {
    throw new Error('API key not found in secret');
  }

  // Cache the key
  cachedApiKey = apiKey;
  apiKeyLastFetched = now;

  return apiKey;
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error) {
  const statusCode = error?.response?.status;
  const errorCode = error?.code;

  // 5xx errors are retryable
  if (statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // Network/timeout errors are retryable
  const retryableErrorCodes = [
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EHOSTUNREACH',
  ];

  if (retryableErrorCodes.includes(errorCode)) {
    return true;
  }

  // 429 is retryable
  if (statusCode === 429) {
    return true;
  }

  // 4xx errors are NOT retryable
  if (statusCode >= 400 && statusCode < 500) {
    return false;
  }

  // Unknown errors - assume retryable
  return true;
}
