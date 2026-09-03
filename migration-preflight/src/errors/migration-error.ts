export class MigrationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = 'MigrationError';
  }

  static from(error: unknown, fallbackCode = 'UNKNOWN'): MigrationError {
    if (error instanceof MigrationError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new MigrationError(fallbackCode, message, true);
  }
}
