/**
 * Winston Logger for GOV.UK Notify Lambda
 * 
 * Structured JSON logging for CloudWatch Logs Insights
 * - Log levels: error, warn, info, debug
 * - Correlation ID tracking
 * - PII redaction
 */

import winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'govuk-notify-sender',
    environment: process.env.ENVIRONMENT || 'production',
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

// Wrapper to ensure consistent log structure
const log = {
  error: (message, meta = {}) => logger.error(message, sanitizeMeta(meta)),
  warn: (message, meta = {}) => logger.warn(message, sanitizeMeta(meta)),
  info: (message, meta = {}) => logger.info(message, sanitizeMeta(meta)),
  debug: (message, meta = {}) => logger.debug(message, sanitizeMeta(meta)),
};

/**
 * Sanitize metadata to remove sensitive data
 * @param {object} meta - Log metadata
 * @returns {object} - Sanitized metadata
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return meta;
  }

  const sanitized = { ...meta };

  // Redact email addresses
  if (sanitized.email_address) {
    sanitized.email_address = redactEmail(sanitized.email_address);
  }

  // Redact personalisation data (may contain PII)
  if (sanitized.personalisation) {
    sanitized.personalisation = '[REDACTED]';
  }

  // Remove API keys
  if (sanitized.apiKey || sanitized.api_key) {
    delete sanitized.apiKey;
    delete sanitized.api_key;
  }

  return sanitized;
}

/**
 * Redact email address for logging
 * @param {string} email - Email address
 * @returns {string} - Redacted email
 */
function redactEmail(email) {
  if (!email || typeof email !== 'string') {
    return '***';
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return '***';
  }

  const [localPart, domain] = parts;
  const redactedLocal = localPart.length > 2
    ? localPart.substring(0, 2) + '***'
    : '***';

  return `${redactedLocal}@${domain}`;
}

export default log;
