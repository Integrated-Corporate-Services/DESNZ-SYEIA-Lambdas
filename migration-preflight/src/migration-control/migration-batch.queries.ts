// SQL only. Repositories own connections and bound values.
export const MIGRATION_BATCH_QUERIES = {
  admit: (schema: string): string =>
    `
      INSERT INTO ${schema}.migration_batch (migration_batch_id, status, preflight_status, manifest_key, manifest_sha256, ingestion_method, correlation_id, preflight_claimed_at, expected_case_count, expected_document_count) 
      VALUES ($1,'ADMITTED','PREFLIGHT_IN_PROGRESS', $2, $3, $4, $5, NOW(), $7, $8) 
      ON CONFLICT (migration_batch_id) 
      DO UPDATE SET preflight_status='PREFLIGHT_IN_PROGRESS', correlation_id=$5, manifest_key=$2, manifest_sha256=$3, ingestion_method=$4, expected_case_count=$7, expected_document_count=$8, preflight_claimed_at=NOW(), updated_at=NOW() 
      WHERE ${schema}.migration_batch.preflight_status='PREFLIGHT_FAILED' OR (${schema}.migration_batch.preflight_status = ANY(ARRAY['PREFLIGHT_IN_PROGRESS','PREFLIGHT_VALIDATED']) 
        AND ${schema}.migration_batch.updated_at < NOW() - make_interval(secs=>$6)) 
      RETURNING *`,

  get: (schema: string): string =>
    `
      SELECT migration_batch_id, preflight_status, step_function_execution_arn 
      FROM ${schema}.migration_batch 
      WHERE migration_batch_id=$1`,

  markValidated: (schema: string): string =>
    `
      UPDATE ${schema}.migration_batch 
      SET preflight_status='PREFLIGHT_VALIDATED', validation_completed_at=NOW(), updated_at=NOW() 
      WHERE migration_batch_id=$1 
        AND correlation_id=$2 
        AND preflight_status='PREFLIGHT_IN_PROGRESS' 
      RETURNING *`,

  markStarted: (schema: string): string =>
    `
      UPDATE ${schema}.migration_batch 
      SET preflight_status='WF1_STARTED', step_function_execution_arn=$3, updated_at=NOW() 
      WHERE migration_batch_id=$1 
        AND correlation_id=$2 
        AND preflight_status='PREFLIGHT_VALIDATED' 
      RETURNING *`,

  recordFailure: (schema: string): string =>
    `
      UPDATE ${schema}.migration_batch 
      SET preflight_status='PREFLIGHT_FAILED', failure_code=$3, failure_reason=$4, updated_at=NOW() 
      WHERE migration_batch_id=$1 
        AND correlation_id=$2 
        AND preflight_status <> 'WF1_STARTED'`,
} as const;
