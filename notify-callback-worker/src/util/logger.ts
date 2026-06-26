import winston from 'winston';

/**
 * Create Winston logger with consistent formatting
 * @param tag - Component tag for log identification
 */
export function createLogger(tag: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'notify-worker-lambda', tag },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, tag: t, ...meta }) => {
            const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
            return `${timestamp} [${(level as string).toUpperCase()}] [${t}] ${message}${extra}`;
          }),
        ),
      }),
    ],
  });
}
