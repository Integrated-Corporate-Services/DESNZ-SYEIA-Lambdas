export type IngestionMethod = 'APPFLOW' | 'DIRECT_S3';

export interface MigrationRequest {
  migrationBatchId: string | null;
  ingestionMethod: IngestionMethod;
  bucket: string;
  prefix: string;
  manifestKey: string;
  appflowExecutionId: string | null;
  appflowFlowName: string | null;
  correlationId: string;
  eventTime: string;
}

export interface PreflightResult {
  outcome:
    'WF1_STARTED' | 'ALREADY_STARTED' | 'IN_PROGRESS_ELSEWHERE' | 'PREFLIGHT_FAILED' | 'SKIPPED';
  migrationBatchId: string | null;
  correlationId: string;
  preflightStatus:
    'PREFLIGHT_IN_PROGRESS' | 'PREFLIGHT_VALIDATED' | 'PREFLIGHT_FAILED' | 'WF1_STARTED' | null;
  stepFunctionExecutionArn: string | null;
  failureCode: string | null;
  failureReason: string | null;
}

export type PreflightStatus = NonNullable<PreflightResult['preflightStatus']>;

export interface MigrationBatch {
  migration_batch_id: string;
  preflight_status: PreflightStatus;
  step_function_execution_arn: string | null;
}
