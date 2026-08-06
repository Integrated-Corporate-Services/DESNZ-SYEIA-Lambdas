import { envConfig } from '../config/env.config';

interface LogContext {
  [key: string]: unknown;
}

export function createLogger(module: string) {
  const prefix = `[${module}]`;

  return {
    debug: (message: string, context?: LogContext) => {
      if (shouldLog('debug')) {
        console.log(JSON.stringify({ level: 'DEBUG', prefix, message, ...context }));
      }
    },

    info: (message: string, context?: LogContext) => {
      if (shouldLog('info')) {
        console.log(JSON.stringify({ level: 'INFO', prefix, message, ...context }));
      }
    },

    warn: (message: string, context?: LogContext) => {
      if (shouldLog('warn')) {
        console.warn(JSON.stringify({ level: 'WARN', prefix, message, ...context }));
      }
    },

    error: (message: string, context?: LogContext) => {
      console.error(JSON.stringify({ level: 'ERROR', prefix, message, ...context }));
    },

    start: (method: string, context?: LogContext) => {
      if (shouldLog('debug')) {
        console.log(JSON.stringify({ level: 'DEBUG', prefix, message: `→ ${method}`, ...context }));
      }
    },

    end: (method: string, context?: LogContext) => {
      if (shouldLog('debug')) {
        console.log(JSON.stringify({ level: 'DEBUG', prefix, message: `← ${method}`, ...context }));
      }
    },
  };
}

let correlationId = '';

export function setCorrelationId(id: string): void {
  correlationId = id;
}

export function getCorrelationId(): string {
  return correlationId;
}

function shouldLog(level: string): boolean {
  const levels = ['debug', 'info', 'warn', 'error'];

  let configuredLevel = 'info';
  try {
    configuredLevel = envConfig.get().logLevel;
  } catch {
    configuredLevel = process.env.LOG_LEVEL || 'info';
  }

  const configLevelIndex = levels.indexOf(configuredLevel);
  const messageLevelIndex = levels.indexOf(level);

  return messageLevelIndex >= (configLevelIndex === -1 ? levels.indexOf('info') : configLevelIndex);
}
