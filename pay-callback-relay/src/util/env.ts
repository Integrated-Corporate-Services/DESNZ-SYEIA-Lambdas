import log from './logger';
import { getDbHost, getDbName, getAwsRegion, hasDbCredentialsConfigured } from './dbConfig';

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

function hasSqsQueueUrl(): boolean {
  return hasEnv('SQS_QUEUE_URL') || hasEnv('WEBHOOK_SQS_QUEUE_URL');
}

export function validateEnvVars(): void {
  const missing: string[] = [];

  if (!getDbHost()) {
    missing.push('DB host (DB_HOST|HOST_NAME|PGHOST)');
  }

  if (!getDbName()) {
    missing.push('DB name (DB_NAME|PGDATABASE)');
  }

  if (!hasDbCredentialsConfigured()) {
    missing.push('DB credentials (DB_CREDENTIALS|DB_USER+DB_PASSWORD|PGUSER+PGPASSWORD)');
  }

  if (!hasEnv('DB_PORT') && !hasEnv('PGPORT')) {
    missing.push('DB port (DB_PORT|PGPORT)');
  }

  if (!getAwsRegion()) {
    missing.push('AWS region (AWS_REGION|REGION)');
  }

  if (!hasSqsQueueUrl()) {
    missing.push('SQS queue URL (SQS_QUEUE_URL|WEBHOOK_SQS_QUEUE_URL)');
  }

  if (missing.length > 0) {
    log.error('[env] Missing required environment variables', { missing });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  log.info('[env] Environment variables validated successfully');
}
