import {
  MIGRATION_MESSAGES,
  MIGRATION_ERROR_CODE,
  MIGRATION_STATE,
} from '../constants/migrationPreflight.constants';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/migrationPreflight.config';
import type { MigrationRequest, PreflightResult } from '../types/migrationPreflight.types';
import { MigrationError } from '../errors/migrationPreflight.error';
import { normaliseEvent } from './migrationEvent.validation';
import { withMigrationContext } from '../logging/migrationPreflight.logger';

export type RunMigrationPreflight = (request: MigrationRequest) => Promise<PreflightResult>;

/** Adapts the Lambda event/response boundary; it owns no SQL or AWS SDK clients. */
export function createMigrationPreflightController(
  config: AppConfig,
  logger: Logger,
  runPreflight: RunMigrationPreflight
) {
  return async (event: unknown, context: { awsRequestId: string }): Promise<PreflightResult> => {
    try {
      const request = normaliseEvent(event, config, context);
      const requestLogger = withMigrationContext(logger, {
        migrationBatchId: request.migrationBatchId,
        correlationId: request.correlationId,
        objectKey: request.manifestKey,
      });
      const result = await runPreflight(request);
      requestLogger.info({ outcome: result.outcome }, MIGRATION_MESSAGES.PREFLIGHT_COMPLETED);
      return result;
    } catch (error) {
      if (error instanceof MigrationError && !error.retryable) {
        logger.warn(
          { code: error.code, retryable: error.retryable },
          MIGRATION_MESSAGES.PREFLIGHT_REJECTED
        );
        return {
          outcome:
            error.code === MIGRATION_ERROR_CODE.UNSUPPORTED_EVENT
              ? MIGRATION_STATE.SKIPPED
              : MIGRATION_STATE.PREFLIGHT_FAILED,
          migrationBatchId: null,
          correlationId: context.awsRequestId,
          preflightStatus: null,
          stepFunctionExecutionArn: null,
          failureCode: error.code,
          failureReason: error.message,
        };
      }
      throw error;
    }
  };
}
