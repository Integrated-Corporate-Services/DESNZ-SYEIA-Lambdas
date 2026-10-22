import { MIGRATION_DEFAULTS } from '../constants/migrationPreflight.constants';
import type { BatchAdmission } from '../types/migrationBatch.types';
import {
  ADMIT_MIGRATION_BATCH_QUERY,
  GET_MIGRATION_BATCH_QUERY,
  MARK_MIGRATION_BATCH_VALIDATED_QUERY,
  MARK_MIGRATION_BATCH_STARTED_QUERY,
  RECORD_MIGRATION_BATCH_FAILURE_QUERY,
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
    const result = await this.db.query<MigrationBatch>(ADMIT_MIGRATION_BATCH_QUERY(this.schema), [
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
    const result = await this.db.query<MigrationBatch>(GET_MIGRATION_BATCH_QUERY(this.schema), [
      batchId,
    ]);
    return result.rows[0] ?? null;
  }

  async markValidated(batchId: string, correlationId: string): Promise<boolean> {
    const result = await this.db.query(MARK_MIGRATION_BATCH_VALIDATED_QUERY(this.schema), [
      batchId,
      correlationId,
    ]);
    return result.rowCount === 1;
  }

  async markStarted(batchId: string, correlationId: string, arn: string | null): Promise<boolean> {
    const result = await this.db.query(MARK_MIGRATION_BATCH_STARTED_QUERY(this.schema), [
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
    await this.db.query(RECORD_MIGRATION_BATCH_FAILURE_QUERY(this.schema), [
      batchId,
      correlationId,
      code,
      reason.slice(0, MIGRATION_DEFAULTS.failureMessageMaxLength),
      fileKey,
    ]);
  }
}
