import winston from 'winston';

const REDACTED_META_KEYS = new Set([
  'request',
  'response',
  'payload',
  'body',
  'headers',
  'rawPayload',
  'raw_payload',
  'requestBody',
  'responseBody',
  'requestHeaders',
  'responseHeaders',
]);

function sanitizeMeta(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((item) => sanitizeMeta(item, depth + 1));

  const source = input as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (REDACTED_META_KEYS.has(key)) continue;
    sanitized[key] = sanitizeMeta(value, depth + 1);
  }
  return sanitized;
}

/**
 * Create a Winston logger instance with consistent formatting
 */
export function createLogger(tag: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, tag: t, ...meta }) => {
        const sanitizedMeta = sanitizeMeta(meta) as Record<string, unknown>;
        const extra = Object.keys(sanitizedMeta).length ? ' ' + JSON.stringify(sanitizedMeta) : '';
        return `${timestamp} [${(level as string).toUpperCase()}] [${t}] ${message}${extra}`;
      })
    ),
    defaultMeta: { service: 'rds-salesforce-worker', tag },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize({ all: true })),
      }),
    ],
  });
}
