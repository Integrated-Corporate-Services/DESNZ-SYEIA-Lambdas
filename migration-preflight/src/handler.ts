import { Pool } from 'pg';
import { AwsS3Store, AwsWorkflowStarter } from './aws/stores';
import { loadConfig } from './config/config';
import { createDatabasePool } from './db/database';
import { MigrationError } from './errors/migration-error';
import { normaliseEvent } from './events/normalise-event';
import { createLogger, withMigrationContext } from './logging/logger';
import { BatchRepository } from './migration-control/repository';
import { MigrationBatchService } from './migration-control/service';
import { PreflightResult } from './types';

const config = loadConfig();
const logger = createLogger();
let databasePromise: Promise<Pool> | undefined;

function database(): Promise<Pool> {
  databasePromise ??= createDatabasePool(config);
  return databasePromise;
}

export function createMigrationPreflightHandler(
  deps = {
    s3: new AwsS3Store(),
    workflow: new AwsWorkflowStarter(config.wf1StateMachineArn),
    getDb: database,
  }
) {
  return async (event: unknown, context: { awsRequestId: string }): Promise<PreflightResult> => {
    try {
      const request = normaliseEvent(event, config, context);
      const requestLogger = withMigrationContext(logger, {
        migrationBatchId: request.migrationBatchId,
        correlationId: request.correlationId,
        objectKey: request.manifestKey,
      });
      const batches = new BatchRepository(await deps.getDb(), config.dbSchema);
      const result = await new MigrationBatchService(
        config,
        deps.s3,
        deps.workflow,
        batches
      ).runPreflight(request);
      requestLogger.info({ outcome: result.outcome }, 'migration.preflight.completed');
      return result;
    } catch (error) {
      if (error instanceof MigrationError) {
        logger.warn(
          { code: error.code, retryable: error.retryable },
          'migration.preflight.rejected'
        );
        return {
          outcome: error.code === 'UNSUPPORTED_EVENT' ? 'SKIPPED' : 'PREFLIGHT_FAILED',
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

export const handler = createMigrationPreflightHandler();
