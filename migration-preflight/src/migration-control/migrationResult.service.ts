import { MIGRATION_STATE } from '../constants/migrationPreflight.constants';
import type { MigrationBatch, PreflightResult } from '../types/migrationPreflight.types';

export function createPreflightResult(
  outcome: PreflightResult['outcome'],
  migrationBatchId: string,
  correlationId: string,
  preflightStatus: PreflightResult['preflightStatus'],
  stepFunctionExecutionArn: string | null = null
): PreflightResult {
  return {
    outcome,
    migrationBatchId,
    correlationId,
    preflightStatus,
    stepFunctionExecutionArn,
    failureCode: null,
    failureReason: null,
  };
}

export function resolveExistingBatchResult(
  batch: MigrationBatch | null,
  migrationBatchId: string,
  correlationId: string
): PreflightResult {
  if (batch?.preflight_status === MIGRATION_STATE.WF1_STARTED) {
    return createPreflightResult(
      MIGRATION_STATE.ALREADY_STARTED,
      migrationBatchId,
      correlationId,
      MIGRATION_STATE.WF1_STARTED,
      batch.step_function_execution_arn
    );
  }
  if (batch?.preflight_status === MIGRATION_STATE.PREFLIGHT_FAILED) {
    return createPreflightResult(
      MIGRATION_STATE.PREFLIGHT_FAILED,
      migrationBatchId,
      correlationId,
      MIGRATION_STATE.PREFLIGHT_FAILED
    );
  }
  return createPreflightResult(
    MIGRATION_STATE.IN_PROGRESS_ELSEWHERE,
    migrationBatchId,
    correlationId,
    MIGRATION_STATE.PREFLIGHT_IN_PROGRESS
  );
}
