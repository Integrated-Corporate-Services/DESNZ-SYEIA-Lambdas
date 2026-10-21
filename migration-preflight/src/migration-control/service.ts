import {
  packageFiles,
  validatePackageKeys,
  validatePackageFile,
} from '../manifest/package-validator';
import { MigrationError } from '../errors/migration-error';
import { parseManifest } from '../manifest/manifest';
import { MigrationRequest, PreflightResult } from '../types';
import { ExecutionAlreadyExistsError, S3Store, WorkflowStarter } from '../aws/stores';
import { BatchRepository } from './repository';
import { AppConfig } from '../config/config';

export class MigrationBatchService {
  constructor(
    private readonly config: AppConfig,
    private readonly s3: S3Store,
    private readonly workflow: WorkflowStarter,
    private readonly batches: BatchRepository,
  ) {}

  async runPreflight(request: MigrationRequest): Promise<PreflightResult> {
    const batchId: string | null = request.migrationBatchId;
    let currentKey = request.manifestKey;
    let mayRecordFailure = false;
    try {
      const raw = await this.s3.getText(
        request.bucket,
        request.manifestKey,
        this.config.manifestMaxBytes,
      );
      const { manifest, sha256 } = parseManifest(raw);

      if (
        manifest.migrationBatchId !== request.migrationBatchId ||
        manifest.ingestionMethod !== request.ingestionMethod
      ) {
        throw new MigrationError('INVALID_MANIFEST', 'Manifest does not match event');
      }
      mayRecordFailure = false;
      const claim = await this.batches.admit(
        manifest.migrationBatchId,
        request.manifestKey,
        sha256,
        request.ingestionMethod,
        request.correlationId,
        this.config.staleAfterSeconds,
        manifest.expectedCaseCount,
        manifest.expectedDocumentCount,
        request.bucket,
        manifest.casesFile.key,
        manifest.documents,
      );
      if (!claim) return this.notClaimed(manifest.migrationBatchId, request.correlationId);

      mayRecordFailure = true;
      validatePackageKeys(manifest, request.prefix);
      const files = packageFiles(manifest);
      for (const file of files) {
        currentKey = file.key;
        await validatePackageFile(this.s3, request.bucket, file);
      }
      currentKey = request.manifestKey;
      if (!(await this.batches.markValidated(manifest.migrationBatchId, request.correlationId))) {
        return this.notClaimed(manifest.migrationBatchId, request.correlationId);
      }
      let arn: string | null;
      try {
        arn = await this.workflow.start(`${manifest.migrationBatchId}-${sha256.slice(0, 16)}`, {
          ...this.config.workflowConfig,
          migrationBatchId: manifest.migrationBatchId,
          correlationId: request.correlationId,
        });
      } catch (error) {
        if (error instanceof ExecutionAlreadyExistsError) {
          if (
            !(await this.batches.markStarted(
              manifest.migrationBatchId,
              request.correlationId,
              null,
            ))
          ) {
            return this.notClaimed(manifest.migrationBatchId, request.correlationId);
          }
          return this.result(
            'ALREADY_STARTED',
            manifest.migrationBatchId,
            request.correlationId,
            'WF1_STARTED',
          );
        }
        throw error;
      }
      if (
        !(await this.batches.markStarted(manifest.migrationBatchId, request.correlationId, arn))
      ) {
        return this.notClaimed(manifest.migrationBatchId, request.correlationId);
      }
      return this.result(
        'WF1_STARTED',
        manifest.migrationBatchId,
        request.correlationId,
        'WF1_STARTED',
        arn,
      );
    } catch (error) {
      const failure = MigrationError.from(error);
      if (batchId && mayRecordFailure) {
        await this.batches
          .recordFailure(batchId, request.correlationId, failure.code, failure.message, currentKey)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private async notClaimed(batchId: string, correlationId: string): Promise<PreflightResult> {
    const existing = await this.batches.get(batchId);
    if (existing?.preflight_status === 'WF1_STARTED') {
      return this.result(
        'ALREADY_STARTED',
        batchId,
        correlationId,
        'WF1_STARTED',
        existing.step_function_execution_arn,
      );
    }
    if (existing?.preflight_status === 'PREFLIGHT_FAILED') {
      return this.result('PREFLIGHT_FAILED', batchId, correlationId, 'PREFLIGHT_FAILED');
    }
    return this.result('IN_PROGRESS_ELSEWHERE', batchId, correlationId, 'PREFLIGHT_IN_PROGRESS');
  }

  private result(
    outcome: PreflightResult['outcome'],
    migrationBatchId: string,
    correlationId: string,
    preflightStatus: PreflightResult['preflightStatus'],
    stepFunctionExecutionArn: string | null = null,
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
}
