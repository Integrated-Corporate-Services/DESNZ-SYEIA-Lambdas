const LEVELS: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;

function write(level: string, msg: string, meta: object = {}): void {
  if ((LEVELS[level] ?? 99) > currentLevel) return;
  const entry = { timestamp: new Date().toISOString(), level, msg, service: 'poll-unenqueued-webhooks', ...meta };
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
