import log from '../util/logger.js';
import https from 'https';
import http from 'http';

/**
 * REST Client Service for forwarding webhooks to backend
 * Implements non-blocking communication pattern with retry logic
 */

const BACKEND_API_CONFIG = {
  host: process.env.BACKEND_API_HOST || 'localhost',
  port: process.env.BACKEND_API_PORT || 3000,
  protocol: process.env.BACKEND_API_PROTOCOL || 'https',
  timeout: parseInt(process.env.BACKEND_API_TIMEOUT || '5000'),
  retryAttempts: parseInt(process.env.BACKEND_API_RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.BACKEND_API_RETRY_DELAY || '1000'),
};

/**
 * Forward webhook to backend REST API endpoint
 * @param {object} webhookPayload - The validated webhook payload
 * @param {object} metadata - Additional metadata (requestId, eventId, etc.)
 * @returns {Promise<object>} - Response from backend API
 */
export async function forwardWebhookToBackend(webhookPayload, metadata) {
  const { requestId, eventId, signature } = metadata;
  
  log.info('[RestClient] Forwarding webhook to backend', {
    requestId,
    eventId,
    host: BACKEND_API_CONFIG.host,
    paymentId: webhookPayload.data?.id,
  });

  const payload = {
    webhook: webhookPayload,
    metadata: {
      requestId,
      eventId,
      signature,
      receivedAt: new Date().toISOString(),
      source: 'lambda-webhook-processor',
    },
  };

  try {
    const response = await makeRestRequestWithRetry(
      '/api/govpay/webhook/async',
      'POST',
      payload,
      metadata
    );

    log.info('[RestClient] Backend accepted webhook', {
      requestId,
      eventId,
      statusCode: response.statusCode,
    });

    return {
      success: true,
      statusCode: response.statusCode,
      data: response.data,
    };
  } catch (err) {
    log.error('[RestClient] Failed to forward webhook to backend', {
      requestId,
      eventId,
      error: err.message,
      stack: err.stack,
    });

    throw err;
  }
}

/**
 * Make REST request with retry logic
 * @param {string} path - API endpoint path
 * @param {string} method - HTTP method
 * @param {object} data - Request payload
 * @param {object} context - Request context
 * @returns {Promise<object>} - Response
 */
async function makeRestRequestWithRetry(path, method, data, context) {
  let lastError;
  
  for (let attempt = 1; attempt <= BACKEND_API_CONFIG.retryAttempts; attempt++) {
    try {
      log.debug('[RestClient] Attempting request', {
        attempt,
        maxAttempts: BACKEND_API_CONFIG.retryAttempts,
        requestId: context.requestId,
      });

      const response = await makeRestRequest(path, method, data);
      
      // Success - return immediately
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response;
      }

      // Non-retryable error codes (4xx except 408, 429)
      if (response.statusCode >= 400 && response.statusCode < 500 
          && response.statusCode !== 408 && response.statusCode !== 429) {
        throw new Error(`Non-retryable HTTP ${response.statusCode}: ${response.data?.error || 'Unknown error'}`);
      }

      // Retryable error - save and continue
      lastError = new Error(`HTTP ${response.statusCode}: ${response.data?.error || 'Server error'}`);
      
    } catch (err) {
      lastError = err;
      
      // Don't retry on non-retryable errors
      if (!isRetryableError(err)) {
        throw err;
      }
    }

    // Retry with exponential backoff (except on last attempt)
    if (attempt < BACKEND_API_CONFIG.retryAttempts) {
      const delay = BACKEND_API_CONFIG.retryDelay * Math.pow(2, attempt - 1);
      log.warn('[RestClient] Request failed, retrying', {
        attempt,
        delay,
        error: lastError.message,
        requestId: context.requestId,
      });
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError || new Error('Request failed after all retries');
}

/**
 * Make HTTP/HTTPS request
 * @param {string} path - API endpoint path
 * @param {string} method - HTTP method
 * @param {object} data - Request payload
 * @returns {Promise<object>} - Response
 */
function makeRestRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const protocol = BACKEND_API_CONFIG.protocol === 'https' ? https : http;

    const options = {
      hostname: BACKEND_API_CONFIG.host,
      port: BACKEND_API_CONFIG.port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-API-Key': process.env.BACKEND_API_KEY || '',
        'User-Agent': 'Lambda-Webhook-Processor/1.0',
      },
      timeout: BACKEND_API_CONFIG.timeout,
    };

    const req = protocol.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        let parsedData;
        try {
          parsedData = responseData ? JSON.parse(responseData) : {};
        } catch (err) {
          parsedData = { raw: responseData };
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsedData,
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Check if error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} - True if retryable
 */
function isRetryableError(error) {
  const retryablePatterns = [
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /EHOSTUNREACH/i,
    /ENOTFOUND/i,
    /socket hang up/i,
    /network/i,
    /timeout/i,
    /temporarily unavailable/i,
  ];

  const errorMessage = error.message || error.toString();
  return retryablePatterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  forwardWebhookToBackend,
};
