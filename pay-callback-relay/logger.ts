// logger.ts
// Simple logger utility following project conventions

export function logInfo(prefix: string, message: string, context?: Record<string, unknown>) {
  console.info(`${prefix} ${message}`, context || '');
}

export function logError(prefix: string, message: string, context?: Record<string, unknown>) {
  console.error(`${prefix} ${message}`, context || '');
}
