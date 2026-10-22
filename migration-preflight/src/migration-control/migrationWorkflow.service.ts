import { MIGRATION_DEFAULTS } from '../constants/migrationPreflight.constants';
import type { AppConfig } from '../config/migrationPreflight.config';
import type { MigrationRequest } from '../types/migrationPreflight.types';
import { ExecutionAlreadyExistsError, WorkflowStarter } from '../aws/migrationWorkflow.repository';

export interface WorkflowStartResult {
  alreadyStarted: boolean;
  executionArn: string | null;
}

export async function startMigrationWorkflow(
  workflow: WorkflowStarter,
  request: MigrationRequest,
  manifestHash: string,
  config: AppConfig
): Promise<WorkflowStartResult> {
  const executionName =
    request.migrationBatchId + '-' + manifestHash.slice(0, MIGRATION_DEFAULTS.executionHashLength);
  try {
    const executionArn = await workflow.start(executionName, {
      ...config.workflowConfig,
      migrationBatchId: request.migrationBatchId,
      correlationId: request.correlationId,
    });
    return { alreadyStarted: false, executionArn };
  } catch (error) {
    if (error instanceof ExecutionAlreadyExistsError) {
      return { alreadyStarted: true, executionArn: null };
    }
    throw error;
  }
}
