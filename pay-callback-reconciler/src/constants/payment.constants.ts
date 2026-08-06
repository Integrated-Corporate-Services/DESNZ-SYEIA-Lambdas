/**
 * Payment Constants
 * Constants used across the payment processing domain
 */

/**
 * Valid payment statuses
 */
export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CAPTURED: 'captured',
  SETTLED: 'settled',
  REFUNDED: 'refunded',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;

/**
 * GOV.UK Pay webhook event types
 */
export const WEBHOOK_EVENT_TYPES = {
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_SETTLED: 'payment.settled',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_EXPIRED: 'payment.expired',
} as const;

/**
 * Normalized event types (internal representation)
 */
export const NORMALIZED_EVENT_TYPES = {
  CONFIRMED: 'CONFIRMED',
  CAPTURED: 'CAPTURED',
  SETTLED: 'SETTLED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;

/**
 * Event type mapping from GOV.UK Pay to internal format
 */
export const EVENT_TYPE_MAPPING: Record<string, string> = {
  'payment.confirmed': NORMALIZED_EVENT_TYPES.CONFIRMED,
  'payment.captured': NORMALIZED_EVENT_TYPES.CAPTURED,
  'payment.settled': NORMALIZED_EVENT_TYPES.SETTLED,
  'payment.refunded': NORMALIZED_EVENT_TYPES.REFUNDED,
  'payment.failed': NORMALIZED_EVENT_TYPES.FAILED,
  'payment.expired': NORMALIZED_EVENT_TYPES.EXPIRED,
};

/**
 * Status corresponding to each normalized event type
 */
export const EVENT_STATUS_MAPPING: Record<string, string> = {
  [NORMALIZED_EVENT_TYPES.CONFIRMED]: PAYMENT_STATUSES.CONFIRMED,
  [NORMALIZED_EVENT_TYPES.CAPTURED]: PAYMENT_STATUSES.CAPTURED,
  [NORMALIZED_EVENT_TYPES.SETTLED]: PAYMENT_STATUSES.SETTLED,
  [NORMALIZED_EVENT_TYPES.REFUNDED]: PAYMENT_STATUSES.REFUNDED,
  [NORMALIZED_EVENT_TYPES.FAILED]: PAYMENT_STATUSES.FAILED,
  [NORMALIZED_EVENT_TYPES.EXPIRED]: PAYMENT_STATUSES.EXPIRED,
};

/**
 * CloudWatch metric namespaces
 */
export const METRICS = {
  NAMESPACE: 'PaymentProcessor',
  PAYMENT_WEBHOOK_PROCESSED: 'payment.webhook.processed',
  PAYMENT_WEBHOOK_DUPLICATE: 'payment.webhook.duplicate',
  PAYMENT_WEBHOOK_SIGNATURE_INVALID: 'payment.webhook.signature_invalid',
  PAYMENT_WEBHOOK_SIGNATURE_MISSING: 'payment.webhook.signature_missing',
  PAYMENT_WEBHOOK_GOVPAY_API_INVALID: 'payment.webhook.govpay_api_invalid',
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_STATUS: 'payment.status',
} as const;

/**
 * Environment variable keys
 */
export const ENV_KEYS = {
  // Database
  HOST_NAME: 'HOST_NAME',
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT',
  DB_NAME: 'DB_NAME',
  DB_CREDENTIALS: 'DB_CREDENTIALS',
  DB_USER: 'DB_USER',
  DB_PASSWORD: 'DB_PASSWORD',
  
  // GOV.UK Pay (webhook signing — aliases shared with inbound-event-receiver)
  GOVUK_PAY_WEBHOOK_SECRET: 'GOVUK_PAY_WEBHOOK_SECRET',
  GOVPAY_WEBHOOK_SIGNING_KEY: 'GOVPAY_WEBHOOK_SIGNING_KEY',
  GOVPAY_CALLBACK_SIGNING_SECRET: 'GOVPAY_CALLBACK_SIGNING_SECRET',
  // GOV.UK Pay REST API — SSM Parameter Store paths (GOVPAY_API_KEY / GOVPAY_API_URL)
  GOVPAY_API_KEY: '/GOVPAY/API/KEY',
  GOVPAY_API_URL: '/GOVPAY/EXTERNAL/API/BASE/URL',
  GOVPAY_API_VALIDATION_ENABLED: 'GOVPAY_API_VALIDATION_ENABLED',
  
  // AWS
  AWS_REGION: 'AWS_REGION',
  WEBHOOK_SQS_QUEUE_URL: 'WEBHOOK_SQS_QUEUE_URL',
  
  // ECS (optional)
  ECS_CLUSTER_ARN: 'ECS_CLUSTER_ARN',
  ECS_WEBHOOK_TASK_DEFINITION: 'ECS_WEBHOOK_TASK_DEFINITION',
  
  // Logging
  LOG_LEVEL: 'LOG_LEVEL',
} as const;

/**
 * Required environment variables
 */
export const REQUIRED_ENV_VARS = [
  ENV_KEYS.DB_PORT,
  ENV_KEYS.DB_NAME,
  ENV_KEYS.DB_CREDENTIALS,
  ENV_KEYS.AWS_REGION,
  ENV_KEYS.WEBHOOK_SQS_QUEUE_URL,
  ENV_KEYS.ECS_CLUSTER_ARN,
  ENV_KEYS.ECS_WEBHOOK_TASK_DEFINITION,
] as const;
