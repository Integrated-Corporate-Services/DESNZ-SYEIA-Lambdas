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

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableProcessingError) return true;

  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED')) return true;
    if (error.message.includes('ETIMEDOUT')) return true;
    if (error.message.includes('ENOTFOUND')) return true;

    if ('code' in error) {
      const pgError = error as { code: string };
      return ['08000', '08003', '08006', '40001', '40P01'].includes(pgError.code);
    }
  }

  return false;
}
