const LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;

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

function write(level: string, msg: string, meta: object = {}): void {
  if ((LEVELS[level] ?? 99) > currentLevel) return;
  const sanitizedMeta = sanitizeMeta(meta) as Record<string, unknown>;
  const entry = { timestamp: new Date().toISOString(), level, msg, service: 'poll-unenqueued-webhooks', ...sanitizedMeta };
  if (level === 'error' || level === 'warn') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

const log = {
  error: (msg: string, meta?: object) => write('error', msg, meta),
  warn:  (msg: string, meta?: object) => write('warn',  msg, meta),
  info:  (msg: string, meta?: object) => write('info',  msg, meta),
  debug: (msg: string, meta?: object) => write('debug', msg, meta),
};
export default log;
