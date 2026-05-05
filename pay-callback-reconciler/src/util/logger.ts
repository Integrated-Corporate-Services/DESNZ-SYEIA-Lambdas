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

function write(level: LogLevel, msg: string, meta: Record<string, any> = {}): void {
  if ((LEVELS[level] ?? 99) > currentLevel) return;
  const entry: LogEntry = { 
    timestamp: new Date().toISOString(), 
    level, 
    msg, 
    service: 'payment-processor-webhook', 
    ...meta 
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
