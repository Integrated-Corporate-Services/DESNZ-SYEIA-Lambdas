import { MIGRATION_BATCH_QUERIES } from './migration-batch.queries';
import { Pool } from 'pg';
import { assertSafeSqlIdent } from '../config/config';
import { MigrationBatch } from '../types';

export class BatchRepository {
  private readonly schema: string;

  constructor(
    private readonly db: Pool,
    schema: string
  ) {
    this.schema = assertSafeSqlIdent(schema);
  }

  async admit(
    batchId: string,
    manifestKey: string,
    hash: string,
    ingestionMethod: string,
    correlationId: string,
    staleAfterSeconds: number,
    expectedCaseCount: number,
    expectedDocumentCount: number
  ): Promise<MigrationBatch | null> {
    const result = await this.db.query<MigrationBatch>(MIGRATION_BATCH_QUERIES.admit(this.schema), [
      batchId,
      manifestKey,
      hash,
      ingestionMethod,
      correlationId,
      staleAfterSeconds,
      expectedCaseCount,
      expectedDocumentCount,
    ]);
    return result.rows[0] ?? null;
  }

  async get(batchId: string): Promise<MigrationBatch | null> {
    const result = await this.db.query<MigrationBatch>(MIGRATION_BATCH_QUERIES.get(this.schema), [
      batchId,
    ]);
    return result.rows[0] ?? null;
  }

  async markValidated(batchId: string, correlationId: string): Promise<boolean> {
    const result = await this.db.query(MIGRATION_BATCH_QUERIES.markValidated(this.schema), [
      batchId,
      correlationId,
    ]);
    return result.rowCount === 1;
  }

  async markStarted(batchId: string, correlationId: string, arn: string | null): Promise<boolean> {
    const result = await this.db.query(MIGRATION_BATCH_QUERIES.markStarted(this.schema), [
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
    reason: string
  ): Promise<void> {
    await this.db.query(MIGRATION_BATCH_QUERIES.recordFailure(this.schema), [
      batchId,
      correlationId,
      code,
      reason.slice(0, 2000),
    ]);
  }
}
