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
    private readonly batches: BatchRepository
  ) {}
  async runPreflight(request: MigrationRequest): Promise<PreflightResult> {
    let batchId: string | null = null;
    try {
      const raw = await this.s3.getText(
        request.bucket,
        request.manifestKey,
        this.config.manifestMaxBytes
      );
      const { manifest, sha256 } = parseManifest(raw);
      batchId = manifest.migrationBatchId;
      if (
        manifest.migrationBatchId !== request.migrationBatchId ||
        manifest.ingestionMethod !== request.ingestionMethod
      ) {
        throw new MigrationError('INVALID_MANIFEST', 'Manifest does not match event');
      }
      const claim = await this.batches.admit(
        manifest.migrationBatchId,
        request.manifestKey,
        sha256,
        request.ingestionMethod,
        request.correlationId,
        this.config.staleAfterSeconds,
        manifest.expectedCaseCount,
        manifest.expectedDocumentCount
      );
      if (!claim) return this.notClaimed(manifest.migrationBatchId, request.correlationId);

      const files = [manifest.casesFile, ...manifest.documents];
      if (new Set(files.map((file) => file.key)).size !== files.length) {
        throw new MigrationError('INVALID_MANIFEST', 'Manifest has duplicate document keys');
      }
      for (const file of files) {
        if (!this.isSafePackageKey(file.key, request.prefix)) {
          throw new MigrationError('INVALID_MANIFEST', 'Manifest has an unsafe package key');
        }
        let head: { size: number; checksum?: string };
        try {
          head = await this.s3.head(request.bucket, file.key);
        } catch (error) {
          throw error;
        }
        if (head.size !== file.sizeBytes) {
          throw new MigrationError('MISSING_FILE', 'Declared file size does not match S3');
        }
        if (file.checksum && head.checksum?.toLowerCase() !== file.checksum.toLowerCase()) {
          throw new MigrationError('CHECKSUM_MISMATCH', 'Declared file checksum does not match S3');
        }
      }
      if (!(await this.batches.markValidated(manifest.migrationBatchId, request.correlationId))) {
        return this.notClaimed(manifest.migrationBatchId, request.correlationId);
      }
      let arn: string | null;
      try {
        arn = await this.workflow.start(`${manifest.migrationBatchId}-${sha256.slice(0, 16)}`, {
          migrationBatchId: manifest.migrationBatchId,
          correlationId: request.correlationId,
        });
      } catch (error) {
        if (error instanceof ExecutionAlreadyExistsError) {
          await this.batches.markStarted(manifest.migrationBatchId, request.correlationId, null);
          return this.result(
            'ALREADY_STARTED',
            manifest.migrationBatchId,
            request.correlationId,
            'WF1_STARTED'
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
        arn
      );
    } catch (error) {
      if (error instanceof MigrationError && batchId) {
        await this.batches.recordFailure(batchId, request.correlationId, error.code, error.message);
      }
      throw error;
    }
  }

  private isSafePackageKey(key: string, prefix: string): boolean {
    return (
      key.startsWith(`${prefix}/`) && !/(^|\/)\.\.?($|\/)|\\|\/\//.test(key) && !key.startsWith('/')
    );
  }

  private async notClaimed(batchId: string, correlationId: string): Promise<PreflightResult> {
    const existing = await this.batches.get(batchId);
    if (existing?.preflight_status === 'WF1_STARTED') {
      return this.result(
        'ALREADY_STARTED',
        batchId,
        correlationId,
        'WF1_STARTED',
        existing.step_function_execution_arn
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
}
