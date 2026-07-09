/**
 * Environment Configuration
 * Centralizes all environment variable access
 */

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
 * Salesforce configuration
 */
export const SALESFORCE_CONFIG = {
  apiUrl: process.env.SALESFORCE_API_URL ?? '',
  secretName: process.env.SALESFORCE_SECRET_NAME ?? 'salesforce/api-credentials',
  secretTtlMs: parseInt(process.env.SALESFORCE_SECRET_TTL_MS || '300000', 10), // 5 minutes
  timeout: parseInt(process.env.SALESFORCE_TIMEOUT_MS || '30000', 10), // 30 seconds
};

/**
 * SQS queue URLs
 */
export const FATAL_QUEUE_URL = process.env.SALESFORCE_FATAL_QUEUE_URL ?? '';

/**
 * Validate required environment variables
 */
export function validateEnvironment(): void {
  const required = ['DATABASE_URL', 'SALESFORCE_API_URL', 'SALESFORCE_SECRET_NAME', 'SALESFORCE_FATAL_QUEUE_URL'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
