import { LOG_MARKERS, LOG_DOMAIN } from '../constants/log.constants';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const SERVICE = process.env.SERVICE_NAME || 'bacs-webhook-worker';
const ACTIVE_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';
const THRESHOLD = LEVELS[ACTIVE_LEVEL] ?? LEVELS.info;

let correlationId: string | undefined;

export function setCorrelationId(id: string | undefined): void {
  correlationId = id;
}

export function getCorrelationId(): string | undefined {
  return correlationId;
}

export type LogMeta = object;

// Every log line is [Domain][ChildDomain-or-Event][File][Function] message - correlationId,
// so the whole lifecycle of one Lambda invocation can be reconstructed just by grepping one id.
function emit(
  level: LogLevel,
  file: string,
  childDomain: string,
  method: string,
  message: string,
  meta: LogMeta = {},
  event?: string,
): void {
  if (LEVELS[level] > THRESHOLD) return;

  const bracket2 = event || childDomain;
  const corrIdSuffix = correlationId ? ` - ${correlationId}` : '';
  const formattedMsg = `[${LOG_DOMAIN}][${bracket2}][${file}][${method}] ${message}${corrIdSuffix}`;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    file,
    method,
    msg: formattedMsg,
    ...(correlationId ? { correlationId } : {}),
    ...(meta as Record<string, unknown>),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  error: (method: string, message: string, meta?: LogMeta, event?: string) => void;
  warn: (method: string, message: string, meta?: LogMeta, event?: string) => void;
  info: (method: string, message: string, meta?: LogMeta, event?: string) => void;
  debug: (method: string, message: string, meta?: LogMeta, event?: string) => void;

  start: (method: string, meta?: LogMeta) => void;

  end: (method: string, meta?: LogMeta) => void;
}

export function createLogger(file: string, childDomain: string): Logger {
  return {
    error: (method, message, meta, event) => emit('error', file, childDomain, method, message, meta, event),
    warn: (method, message, meta, event) => emit('warn', file, childDomain, method, message, meta, event),
    info: (method, message, meta, event) => emit('info', file, childDomain, method, message, meta, event),
    debug: (method, message, meta, event) => emit('debug', file, childDomain, method, message, meta, event),
    start: (method, meta) => emit('info', file, childDomain, method, LOG_MARKERS.START, meta),
    end: (method, meta) => emit('info', file, childDomain, method, LOG_MARKERS.END, meta),
  };
}

const defaultLogger: Logger = createLogger('logger.ts', 'UTIL');
export default defaultLogger;
