import winston from 'winston';

const log = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'poll-unenqueued-webhooks' },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

export default log;
