import { LOG_MARKERS } from '../constants/log.constants';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const SERVICE = process.env.SERVICE_NAME || 'bacs-webhook-relay';
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

function emit(
  level: LogLevel,
  file: string,
  method: string,
  message: string,
  meta: LogMeta = {},
): void {
  if (LEVELS[level] > THRESHOLD) return;

  const formattedMsg = `[${file}] [${method}] ${message}`;

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
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  error: (method: string, message: string, meta?: LogMeta) => void;
  warn:  (method: string, message: string, meta?: LogMeta) => void;
  info:  (method: string, message: string, meta?: LogMeta) => void;
  debug: (method: string, message: string, meta?: LogMeta) => void;
  
  start: (method: string, meta?: LogMeta) => void;
  
  end:   (method: string, meta?: LogMeta) => void;
}

export function createLogger(file: string): Logger {
  return {
    error: (method, message, meta) => emit('error', file, method, message, meta),
    warn:  (method, message, meta) => emit('warn',  file, method, message, meta),
    info:  (method, message, meta) => emit('info',  file, method, message, meta),
    debug: (method, message, meta) => emit('debug', file, method, message, meta),
    start: (method, meta) => emit('info', file, method, LOG_MARKERS.START, meta),
    end:   (method, meta) => emit('info', file, method, LOG_MARKERS.END,   meta),
  };
}

const defaultLogger: Logger = createLogger('logger.ts');
export default defaultLogger;
