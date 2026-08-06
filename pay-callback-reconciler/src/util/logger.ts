type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  service: string;
  [key: string]: any;
}

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'] ?? 2;

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

function write(level: LogLevel, msg: string, meta: Record<string, any> = {}): void {
  if ((LEVELS[level] ?? 99) > currentLevel) return;
  const sanitizedMeta = sanitizeMeta(meta) as Record<string, unknown>;
  const entry: LogEntry = { 
    timestamp: new Date().toISOString(), 
    level, 
    msg, 
    service: 'payment-processor-webhook', 
    ...sanitizedMeta 
  };
  if (level === 'error' || level === 'warn') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

const log = {
  error: (msg: string, meta?: Record<string, any>) => write('error', msg, meta),
  warn:  (msg: string, meta?: Record<string, any>) => write('warn',  msg, meta),
  info:  (msg: string, meta?: Record<string, any>) => write('info',  msg, meta),
  debug: (msg: string, meta?: Record<string, any>) => write('debug', msg, meta),
};

export default log;
