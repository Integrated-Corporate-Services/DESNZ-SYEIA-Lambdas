/**
 * Environment Configuration
 * Centralizes all environment variable access
 */

/**
 * Relay batch size (number of events to process per invocation)
 */
export const RELAY_BATCH_SIZE = parseInt(
  process.env.NOTIFY_RELAY_BATCH_SIZE || '50',
  10,
);

/**
 * Database configuration
 */
export const DATABASE_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  maxConnections: parseInt(process.env.DB_POOL_MAX || '5', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

/**
 * AWS configuration
 */
export const AWS_CONFIG = {
  region: process.env.AWS_REGION ?? 'eu-west-2',
  endpoint: process.env.AWS_ENDPOINT,
};

/**
 * SQS queue URL
 */
export const QUEUE_URL = process.env.NOTIFY_QUEUE_URL ?? '';

/**
 * Validate required environment variables
 */
export function validateEnvironment(): void {
  const required = ['DATABASE_URL', 'NOTIFY_QUEUE_URL'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
