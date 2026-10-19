// error.js
export class TransientError extends Error {
  retryable = true;
}
export class PermanentError extends Error {
  retryable = false;
}
