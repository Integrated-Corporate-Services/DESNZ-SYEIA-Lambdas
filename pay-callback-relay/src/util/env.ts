import log from './logger';

export function validateEnvVars() {
  const required = [
    'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
    'AWS_REGION', 'AWS_ENDPOINT_URL', 'SQS_QUEUE_URL',
  ];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    log.error('[env] Missing required environment variables', { missing });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  log.info('[env] Environment variables validated successfully');
}
