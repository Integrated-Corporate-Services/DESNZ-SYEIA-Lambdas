export class TransientError extends Error {
  constructor(message) { super(message); this.name = 'TransientError'; this.retryable = true; }
}
export class PermanentError extends Error {
  constructor(message) { super(message); this.name = 'PermanentError'; this.retryable = false; }
}
