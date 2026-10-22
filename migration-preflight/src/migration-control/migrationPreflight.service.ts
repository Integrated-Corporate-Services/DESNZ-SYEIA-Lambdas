import { MIGRATION_STATE } from '../constants/migrationPreflight.constants';
import type { AppConfig } from '../config/migrationPreflight.config';
import type { S3Store } from '../aws/migrationS3.repository';
import type { WorkflowStarter } from '../aws/migrationWorkflow.repository';
import type { BatchRepository } from './migrationBatch.repository';
import type { MigrationRequest, PreflightResult } from '../types/migrationPreflight.types';
import { MigrationError } from '../errors/migrationPreflight.error';
import {
  packageFiles,
  validatePackageKeys,
  validatePackageFile,
} from '../manifest/migrationPackage.validation';
import { readMigrationManifest } from '../manifest/migrationManifest.service';
import { startMigrationWorkflow } from './migrationWorkflow.service';
import { createPreflightResult, resolveExistingBatchResult } from './migrationResult.service';

export class MigrationPreflightService {
  constructor(
    private readonly config: AppConfig,
    private readonly s3: S3Store,
    private readonly workflow: WorkflowStarter,
    private readonly batches: Pick<
      BatchRepository,
      'admit' | 'get' | 'markValidated' | 'markStarted' | 'recordFailure'
    >
  ) {}

  async runPreflight(request: MigrationRequest): Promise<PreflightResult> {
    let failureFileKey = request.manifestKey;
    let ownsBatchClaim = false;

    try {
      const { manifest, sha256 } = await readMigrationManifest(this.s3, request, this.config);
      const claimedBatch = await this.batches.admit({
        migrationBatchId: manifest.migrationBatchId,
        manifestKey: request.manifestKey,
        manifestSha256: sha256,
        ingestionMethod: request.ingestionMethod,
        correlationId: request.correlationId,
        staleAfterSeconds: this.config.staleAfterSeconds,
        expectedCaseCount: manifest.expectedCaseCount,
        expectedDocumentCount: manifest.expectedDocumentCount,
        sourceBucket: request.bucket,
        casesFileKey: manifest.casesFile.key,
        documents: manifest.documents,
      });

      if (!claimedBatch)
        return this.getExistingResult(manifest.migrationBatchId, request.correlationId);
      ownsBatchClaim = true;

      validatePackageKeys(manifest, request.prefix);
      for (const file of packageFiles(manifest)) {
        failureFileKey = file.key;
        await validatePackageFile(this.s3, request.bucket, file);
      }

      failureFileKey = request.manifestKey;
      const isValidated = await this.batches.markValidated(
        manifest.migrationBatchId,
        request.correlationId
      );
      if (!isValidated)
        return this.getExistingResult(manifest.migrationBatchId, request.correlationId);

      const workflowResult = await startMigrationWorkflow(
        this.workflow,
        request,
        sha256,
        this.config
      );
      const isStarted = await this.batches.markStarted(
        manifest.migrationBatchId,
        request.correlationId,
        workflowResult.executionArn
      );
      if (!isStarted)
        return this.getExistingResult(manifest.migrationBatchId, request.correlationId);

      return createPreflightResult(
        workflowResult.alreadyStarted
          ? MIGRATION_STATE.ALREADY_STARTED
          : MIGRATION_STATE.WF1_STARTED,
        manifest.migrationBatchId,
        request.correlationId,
        MIGRATION_STATE.WF1_STARTED,
        workflowResult.executionArn
      );
    } catch (error) {
      if (request.migrationBatchId && ownsBatchClaim) {
        const failure = MigrationError.from(error);
        await this.batches
          .recordFailure(
            request.migrationBatchId,
            request.correlationId,
            failure.code,
            failure.message,
            failureFileKey
          )
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private async getExistingResult(
    batchId: string,
    correlationId: string
  ): Promise<PreflightResult> {
    const batch = await this.batches.get(batchId);
    return resolveExistingBatchResult(batch, batchId, correlationId);
  }
}
