/**
 * Custom error classes for worker processing
 */

export class RetryableProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableProcessingError';
  }
}

/**
 * Non-retryable error indicating the event should be marked as fatal/DLQ
 */
export class FatalEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalEventError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Salesforce API authentication error
 */
export class SalesforceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesforceAuthError';
  }
}

/**
 * Salesforce API rate limit error (retryable)
 */
export class SalesforceRateLimitError extends RetryableProcessingError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = 'SalesforceRateLimitError';
  }
}

/**
 * Salesforce API validation error (non-retryable)
 */
export class SalesforceValidationError extends FatalEventError {
  constructor(message: string, public readonly errors?: unknown[]) {
    super(message);
    this.name = 'SalesforceValidationError';
  }
}

/**
 * Type guard to check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableProcessingError) return true;
  if (error instanceof SalesforceRateLimitError) return true;

  if (error instanceof Error) {
    // Database connection errors are retryable
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return true;
    }

    // PostgreSQL transient errors
    const pgErrorCodes = ['08000', '08003', '08006', '40001', '53300', '57P03'];
    if ('code' in error && typeof error.code === 'string') {
      if (pgErrorCodes.includes(error.code)) {
        return true;
      }
    }

    // Axios/HTTP timeout errors are retryable
    if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET')) {
      return true;
    }
  }

  return false;
}
