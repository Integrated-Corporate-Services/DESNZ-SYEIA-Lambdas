import { MIGRATION_DEFAULTS } from '../constants/migrationPreflight.constants';
import type { BatchAdmission } from '../types/migrationBatch.types';
import {
  ADMIT_MIGRATION_BATCH,
  GET_MIGRATION_BATCH,
  MARK_MIGRATION_BATCH_VALIDATED,
  MARK_MIGRATION_BATCH_STARTED,
  RECORD_MIGRATION_BATCH_FAILURE,
} from './migrationBatch.queries';
import { Pool } from 'pg';
import { assertSafeSqlIdent } from '../config/migrationPreflight.config';
import { MigrationBatch } from '../types/migrationPreflight.types';

export class BatchRepository {
  private readonly schema: string;

  constructor(
    private readonly db: Pool,
    schema: string
  ) {
    this.schema = assertSafeSqlIdent(schema);
  }

  async admit(input: BatchAdmission): Promise<MigrationBatch | null> {
    const result = await this.db.query<MigrationBatch>(ADMIT_MIGRATION_BATCH(this.schema), [
      input.migrationBatchId,
      input.manifestKey,
      input.manifestSha256,
      input.ingestionMethod,
      input.correlationId,
      input.staleAfterSeconds,
      input.expectedCaseCount,
      input.expectedDocumentCount,
      input.sourceBucket,
      input.casesFileKey,
      JSON.stringify(input.documents),
    ]);
    return result.rows[0] ?? null;
  }

  async get(batchId: string): Promise<MigrationBatch | null> {
    const result = await this.db.query<MigrationBatch>(GET_MIGRATION_BATCH(this.schema), [batchId]);
    return result.rows[0] ?? null;
  }

  async markValidated(batchId: string, correlationId: string): Promise<boolean> {
    const result = await this.db.query(MARK_MIGRATION_BATCH_VALIDATED(this.schema), [
      batchId,
      correlationId,
    ]);
    return result.rowCount === 1;
  }

  async markStarted(batchId: string, correlationId: string, arn: string | null): Promise<boolean> {
    const result = await this.db.query(MARK_MIGRATION_BATCH_STARTED(this.schema), [
      batchId,
      correlationId,
      arn,
    ]);
    return result.rowCount === 1;
  }

  async recordFailure(
    batchId: string,
    correlationId: string,
    code: string,
    reason: string,
    fileKey: string | null = null
  ): Promise<void> {
    await this.db.query(RECORD_MIGRATION_BATCH_FAILURE(this.schema), [
      batchId,
      correlationId,
      code,
      reason.slice(0, MIGRATION_DEFAULTS.failureMessageMaxLength),
      fileKey,
    ]);
  }
}
