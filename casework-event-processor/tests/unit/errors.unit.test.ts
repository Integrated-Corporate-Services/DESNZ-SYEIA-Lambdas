import { RetryableProcessingError, isRetryableError } from '../../src/errors';

describe('isRetryableError', () => {
  it('returns true for RetryableProcessingError', () => {
    expect(isRetryableError(new RetryableProcessingError('boom'))).toBe(true);
  });

  it('returns true for connection-reset style errors', () => {
    expect(isRetryableError(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(true);
  });

  it('returns true for retryable Postgres error codes', () => {
    const pgError = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    expect(isRetryableError(pgError)).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('invalid payload'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('not an error')).toBe(false);
  });
});
