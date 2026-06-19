import { ERROR_CODES, type ErrorCode } from '../constants/error.constants';

export interface AppErrorOptions {
  retryable?: boolean;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly meta: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.meta = opts.meta ?? {};
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseAuthError extends AppError {
  constructor(message: string, opts: { cause?: unknown; pgCode?: string } = {}) {
    super(ERROR_CODES.DB_AUTH_FAILED, message, {
      retryable: true,
      meta: { pgCode: opts.pgCode },
      cause: opts.cause,
    });
  }
}

export class PoisonMessageError extends AppError {
  constructor(message: string, opts: { cause?: unknown; meta?: Record<string, unknown> } = {}) {
    super(ERROR_CODES.POISON_MESSAGE, message, {
      retryable: false,
      meta: opts.meta,
      cause: opts.cause,
    });
  }
}

export class TransientError extends AppError {
  constructor(message: string, opts: { cause?: unknown; meta?: Record<string, unknown> } = {}) {
    super(ERROR_CODES.TRANSIENT, message, {
      retryable: true,
      meta: opts.meta,
      cause: opts.cause,
    });
  }
}
