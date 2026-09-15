export const LOG_DOMAIN = 'BACS';

export const LOG_MARKERS = {
  START: 'STARTs',
  END: 'ENDs',
} as const;

export type LogMarker = (typeof LOG_MARKERS)[keyof typeof LOG_MARKERS];

export const LOG_CHILD_DOMAIN = {
  HANDLER: 'RELAY',
  RELAY_SERVICE: 'RELAY',
  MESSAGE_BUILDER: 'RELAY',
  RETRY: 'RELAY',
  CONFIG: 'CONFIG',
  DATABASE_POOL: 'DATABASE',
  PAYMENT_WEBHOOKS_QUERIES: 'DATABASE',
  PAYMENT_WEBHOOKS_REPOSITORY: 'DATABASE',
  SQS: 'SQS',
} as const;

export const LOG_EVENTS = {
  WEBHOOK_ENQUEUED: 'ENQUEUED',
  WEBHOOK_DEAD_LETTERED: 'DEAD_LETTERED',
  DLQ_FORWARD_FAILED: 'DLQ_FORWARD_FAILED',
  ENQUEUE_FAILED: 'ENQUEUE_FAILED',
  INVOCATION_FAILED: 'INVOCATION_FAILED',
} as const;

export const LOG_MESSAGES = {
  ENV_LOADED: 'environment loaded',
  ENV_MISSING: 'missing required environment variables',

  SECRET_LOADED: 'credentials loaded from Secrets Manager',
  SECRET_CACHE_INVALIDATED: 'cache invalidated — will refresh on next access',
  SECRET_EMPTY_STRING: 'Secrets Manager returned empty SecretString',
  SECRET_PARSE_FAILED: 'secret is not valid JSON',
  SECRET_SHAPE_INVALID: 'secret JSON missing username/password',

  SSM_PARAMETER_LOADED: 'SSM parameter loaded',
  SSM_PARAMETER_EMPTY: 'SSM parameter returned empty value',
  SSM_PARAMETER_NON_NUMERIC: 'SSM batch-size parameter is non-numeric — falling back to default',
  SSM_PARAMETER_LOAD_FAILED: 'failed to read SSM parameter — falling back to default',

  SQS_MESSAGE_SENT_MAIN: 'message sent to main queue',
  SQS_MESSAGE_SENT_DLQ: 'message sent to dead-letter queue',
  SQS_QUEUE_URL_MISSING: 'queue URL not configured',

  DB_POOL_INITIALISED: 'pool initialised',
  DB_POOL_REBUILD_AFTER_AUTH_FAILURE: 'rebuilding pool after auth failure',
  DB_POOL_DRAIN_ERROR: 'error draining old pool — continuing',
  DB_POOL_IDLE_CLIENT_ERROR: 'unexpected idle client error',
  DB_AUTH_ERROR_DETECTED: 'postgres authentication error detected — refreshing credentials and retrying once',
  DB_AUTH_FAILED_AFTER_REFRESH: 'Postgres rejected refreshed credentials',
  DB_ROLLBACK_FAILED: 'error rolling back transaction — continuing to throw original error',

  RETRY_ATTEMPT_FAILED: 'attempt failed, will retry',

  RELAY_NO_WEBHOOKS: 'no pending payment_webhooks rows — nothing to do',
  RELAY_WEBHOOKS_SELECTED: 'selected payment_webhooks rows to relay',
  RELAY_WEBHOOK_ENQUEUED: 'webhook enqueued to partner queue',
  RELAY_CORRELATION_ID_ADOPTED: 'adopted database correlation_id for traceability',
  RELAY_BATCH_COMPLETE: 'batch complete',
  RELAY_POISON_DLQ_FAILED: 'failed to forward poison message to DLQ — leaving row for retry',
  RELAY_TRANSIENT_FAILURE: 'transient failure — leaving row for next invocation',

  HANDLER_INVOCATION_START: 'invocation start',
  HANDLER_INVOCATION_COMPLETE: 'invocation complete',
  HANDLER_INVOCATION_FAILED: 'invocation failed',
} as const;
