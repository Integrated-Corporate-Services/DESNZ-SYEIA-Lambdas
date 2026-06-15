import { SQSRecord } from 'aws-lambda';
import log from './logger.js';
import type { SQSMessageBody } from '../types/index.js';
import { getDbHost, getDbName, hasDbCredentialsConfigured } from './dbConfig.js';

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

function isLocalStackEnvironment(): boolean {
  return Boolean(process.env.AWS_ENDPOINT_URL);
}

/**
 * Validate required environment variables at Lambda cold start
 * @throws {Error} if any required variables are missing
 */
export function validateEnvVars(): boolean {
  const missing: string[] = [];

  if (!getDbHost()) {
    missing.push('DB host (PGHOST|DB_HOST|HOST_NAME)');
  }

  if (!getDbName()) {
    missing.push('DB name (PGDATABASE|DB_NAME)');
  }

  if (!hasDbCredentialsConfigured()) {
    missing.push('DB credentials (DB_CREDENTIALS|PGUSER+PGPASSWORD|DB_USER+DB_PASSWORD)');
  }

  if (!hasEnv('PGPORT') && !hasEnv('DB_PORT')) {
    missing.push('DB port (PGPORT|DB_PORT)');
  }

  if (!process.env.AWS_REGION && !process.env.REGION) {
    missing.push('AWS region (AWS_REGION|REGION)');
  }

  if (isLocalStackEnvironment()) {
    if (!process.env.WEBHOOK_SQS_QUEUE_URL) {
      missing.push('WEBHOOK_SQS_QUEUE_URL (sqs)');
    }

    if (!process.env.ECS_CLUSTER_ARN) {
      missing.push('ECS_CLUSTER_ARN (ecs)');
    }

    if (!process.env.ECS_WEBHOOK_TASK_DEFINITION) {
      missing.push('ECS_WEBHOOK_TASK_DEFINITION (ecs)');
    }

    if (!process.env.GOVUK_PAY_WEBHOOK_SECRET) {
      missing.push('GOVUK_PAY_WEBHOOK_SECRET (security)');
    }
  }

  if (missing.length > 0) {
    const error = `Missing required environment variables: ${missing.join(', ')}`;
    log.error('[validation] Environment validation failed', { missing });
    throw new Error(error);
  }

  log.info('[validation] Environment variables validated successfully');
  return true;
}

/**
 * Validate SQS message structure
 */
export function validateSQSMessage(message: SQSRecord): SQSMessageBody {
  if (!message || !message.body) {
    throw new Error('Invalid SQS message: missing body');
  }

  try {
    const body: SQSMessageBody = JSON.parse(message.body);

    if (!body.webhook) {
      throw new Error('Invalid SQS message: missing webhook');
    }

    if (!body.metadata || !body.metadata.webhookId || !body.metadata.paymentId) {
      throw new Error('Invalid SQS message: missing metadata');
    }

    return body;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Invalid SQS message: body is not valid JSON');
    }
    throw err;
  }
}
