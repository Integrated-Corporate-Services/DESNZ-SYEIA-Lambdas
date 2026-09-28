import winston from 'winston';

export function createLogger(tag: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'casework-event-processor-lambda', tag },
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
