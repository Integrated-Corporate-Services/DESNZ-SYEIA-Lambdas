import { Pool } from 'pg';
import { MigrationBatch } from '../types';

export class BatchRepository {
  constructor(
    private readonly db: Pool,
    private readonly schema: string
  ) {}
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
    const result = await this.db.query<MigrationBatch>(
      `INSERT INTO ${this.schema}.migration_batch (migration_batch_id,status,preflight_status,manifest_key,manifest_sha256,ingestion_method,correlation_id,preflight_claimed_at,expected_case_count,expected_document_count) VALUES ($1,'ADMITTED','PREFLIGHT_IN_PROGRESS',$2,$3,$4,$5,NOW(),$7,$8) ON CONFLICT (migration_batch_id) DO UPDATE SET preflight_status='PREFLIGHT_IN_PROGRESS',correlation_id=$5,manifest_key=$2,manifest_sha256=$3,ingestion_method=$4,expected_case_count=$7,expected_document_count=$8,preflight_claimed_at=NOW(),updated_at=NOW() WHERE ${this.schema}.migration_batch.preflight_status='PREFLIGHT_FAILED' OR (${this.schema}.migration_batch.preflight_status = ANY(ARRAY['PREFLIGHT_IN_PROGRESS','PREFLIGHT_VALIDATED']) AND ${this.schema}.migration_batch.updated_at < NOW() - make_interval(secs=>$6)) RETURNING *`,
      [
        batchId,
        manifestKey,
        hash,
        ingestionMethod,
        correlationId,
        staleAfterSeconds,
        expectedCaseCount,
        expectedDocumentCount,
      ]
    );
    return result.rows[0] ?? null;
  }
  async get(batchId: string): Promise<MigrationBatch | null> {
    const result = await this.db.query<MigrationBatch>(
      `SELECT migration_batch_id, preflight_status, step_function_execution_arn FROM ${this.schema}.migration_batch WHERE migration_batch_id=$1`,
      [batchId]
    );
    return result.rows[0] ?? null;
  }
  async markValidated(batchId: string, correlationId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE ${this.schema}.migration_batch SET preflight_status='PREFLIGHT_VALIDATED',validation_completed_at=NOW(),updated_at=NOW() WHERE migration_batch_id=$1 AND correlation_id=$2 AND preflight_status='PREFLIGHT_IN_PROGRESS' RETURNING *`,
      [batchId, correlationId]
    );
    return result.rowCount === 1;
  }
  async markStarted(batchId: string, correlationId: string, arn: string | null): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE ${this.schema}.migration_batch SET preflight_status='WF1_STARTED',step_function_execution_arn=$3,updated_at=NOW() WHERE migration_batch_id=$1 AND correlation_id=$2 AND preflight_status='PREFLIGHT_VALIDATED' RETURNING *`,
      [batchId, correlationId, arn]
    );
    return result.rowCount === 1;
  }
  async recordFailure(
    batchId: string,
    correlationId: string,
    code: string,
    reason: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE ${this.schema}.migration_batch SET preflight_status='PREFLIGHT_FAILED',failure_code=$3,failure_reason=$4,updated_at=NOW() WHERE migration_batch_id=$1 AND correlation_id=$2 AND preflight_status <> 'WF1_STARTED'`,
      [batchId, correlationId, code, reason.slice(0, 2000)]
    );
  }
}
