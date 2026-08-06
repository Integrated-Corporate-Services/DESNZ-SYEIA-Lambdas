import { SQSRecord } from 'aws-lambda';
import log from './logger.js';
import type { SQSMessageBody } from '../types/index.js';
import { getDbHost, getDbName, hasDbCredentialsConfigured } from './dbConfig.js';
import { hasGovukPayWebhookSecretConfigured } from './webhookSecret.js';

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
    missing.push('DB host (DB_HOST|HOST_NAME)');
  }

  if (!getDbName()) {
    missing.push('DB name (DB_NAME)');
  }

  if (!hasDbCredentialsConfigured()) {
    missing.push('DB credentials (DB_CREDENTIALS|DB_USER+DB_PASSWORD)');
  }

  if (!hasEnv('DB_PORT')) {
    missing.push('DB port (DB_PORT)');
  }

  if (!process.env.AWS_REGION && !process.env.REGION) {
    missing.push('AWS region (AWS_REGION|REGION)');
  }

  // Webhook signing secret is optional at cold start: inbound-event-receiver validates
  // signatures before relay enqueues with source=inbound-event-receiver (worker skips re-check).
  // Secret is only required at runtime for direct GOV.UK Pay → worker messages.
  if (!hasGovukPayWebhookSecretConfigured()) {
    log.warn(
      '[validation] Webhook signing secret not configured; direct webhook signature validation will fail if used'
    );
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
