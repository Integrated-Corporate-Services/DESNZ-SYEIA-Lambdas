/**
 * Custom error classes for worker processing
 */

export class RetryableProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableProcessingError';
  }
}

export class FatalEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalEventError';
  }
}

/**
 * Type guard to check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableProcessingError) return true;

  if (error instanceof Error) {
    // Database connection errors
    if (error.message.includes('ECONNREFUSED')) return true;
    if (error.message.includes('ETIMEDOUT')) return true;
    if (error.message.includes('ENOTFOUND')) return true;

    // PostgreSQL errors
    if ('code' in error) {
      const pgError = error as { code: string };
      // Connection errors, deadlocks, serialization failures
      return ['08000', '08003', '08006', '40001', '40P01'].includes(pgError.code);
    }
  }

  return false;
}
