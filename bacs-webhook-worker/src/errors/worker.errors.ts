export class WorkerError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

export class ValidationError extends WorkerError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends WorkerError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

export class PaymentProcessingError extends WorkerError {
  constructor(message: string) {
    super(message, 'PAYMENT_PROCESSING_ERROR', 500);
    this.name = 'PaymentProcessingError';
  }
}
