import type { ScheduledHandler } from 'aws-lambda';
import { relayService } from './src/services/relay.service';
import { createLogger } from './src/util/logger';
import { getPool, validateEnvironment } from './src/config/env.config';

const logger = createLogger('handler');

/**
 * EventBridge scheduled Lambda handler
 * Triggered every 1 minute
 * Polls notify_callback_event for RECEIVED events and publishes to SQS
 */
export const handler: ScheduledHandler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  validateEnvironment();

  const pool = await getPool();

  logger.info('Relay Lambda invoked', {
    awsRequestId: context.awsRequestId,
    eventTime: event.time,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
  });

  try {
    const metrics = await relayService.execute(pool);

    logger.info('Relay Lambda complete', {
      awsRequestId: context.awsRequestId,
      ...metrics,
    });
  } catch (error) {
    logger.error('Relay Lambda failed', {
      awsRequestId: context.awsRequestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
};
