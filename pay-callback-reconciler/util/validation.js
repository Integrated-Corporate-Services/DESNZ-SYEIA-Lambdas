import log from './logger.js';

/**
 * Validate required environment variables at Lambda cold start
 * @throws {Error} if any required variables are missing
 */
export function validateEnvVars() {
  const required = {
    database: ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'],
    sqs: ['WEBHOOK_SQS_QUEUE_URL'],
    ecs: ['ECS_CLUSTER_ARN', 'ECS_WEBHOOK_TASK_DEFINITION'],
    security: ['GOVUK_PAY_WEBHOOK_SECRET'],
  };

  const missing = [];
  Object.entries(required).forEach(([category, vars]) => {
    vars.forEach(v => {
      if (!process.env[v]) {
        missing.push(`${v} (${category})`);
      }
    });
  });

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
export function validateSQSMessage(message) {
  if (!message || !message.body) {
    throw new Error('Invalid SQS message: missing body');
  }

  try {
    const body = JSON.parse(message.body);
    
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
