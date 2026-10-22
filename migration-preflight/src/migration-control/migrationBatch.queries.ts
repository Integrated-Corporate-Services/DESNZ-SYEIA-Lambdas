import { MIGRATION_STATE } from '../constants/migrationPreflight.constants';

export const ADMIT_MIGRATION_BATCH = (schema: string): string => `
    INSERT INTO ${schema}.migration_batch (
      migration_batch_id,
      status,
      preflight_status,
      manifest_key,
      manifest_sha256,
      ingestion_method,
      correlation_id,
      preflight_claimed_at,
      expected_case_count,
      expected_document_count,
      source_bucket,
      cases_file_key,
      document_files
    )
    VALUES (
      $1, '${MIGRATION_STATE.ADMITTED}', '${MIGRATION_STATE.PREFLIGHT_IN_PROGRESS}', $2, $3, $4, $5,
      NOW(), $7, $8, $9, $10, $11::jsonb
    )
    ON CONFLICT (migration_batch_id)
    DO UPDATE SET
      preflight_status = '${MIGRATION_STATE.PREFLIGHT_IN_PROGRESS}',
      correlation_id = $5,
      manifest_key = $2,
      manifest_sha256 = $3,
      ingestion_method = $4,
      expected_case_count = $7,
      expected_document_count = $8,
      source_bucket = $9,
      cases_file_key = $10,
      document_files = $11::jsonb,
      failure_code = NULL,
      failure_reason = NULL,
      failure_file_key = NULL,
      preflight_claimed_at = NOW(),
      updated_at = NOW()
    WHERE ${schema}.migration_batch.preflight_status = '${MIGRATION_STATE.PREFLIGHT_FAILED}'
       OR (
         ${schema}.migration_batch.preflight_status = ANY(
           ARRAY['${MIGRATION_STATE.PREFLIGHT_IN_PROGRESS}', '${MIGRATION_STATE.PREFLIGHT_VALIDATED}']
         )
         AND ${schema}.migration_batch.updated_at < NOW() - make_interval(secs => $6)
       )
    RETURNING *
  `;

export const GET_MIGRATION_BATCH = (schema: string): string => `
    SELECT migration_batch_id, preflight_status, step_function_execution_arn
    FROM ${schema}.migration_batch
    WHERE migration_batch_id = $1
  `;

export const MARK_MIGRATION_BATCH_VALIDATED = (schema: string): string => `
    UPDATE ${schema}.migration_batch
    SET preflight_status = '${MIGRATION_STATE.PREFLIGHT_VALIDATED}',
        validation_completed_at = NOW(),
        updated_at = NOW()
    WHERE migration_batch_id = $1
      AND correlation_id = $2
      AND preflight_status = '${MIGRATION_STATE.PREFLIGHT_IN_PROGRESS}'
    RETURNING *
  `;

export const MARK_MIGRATION_BATCH_STARTED = (schema: string): string => `
    UPDATE ${schema}.migration_batch
    SET preflight_status = '${MIGRATION_STATE.WF1_STARTED}',
        step_function_execution_arn = $3,
        updated_at = NOW()
    WHERE migration_batch_id = $1
      AND correlation_id = $2
      AND preflight_status = '${MIGRATION_STATE.PREFLIGHT_VALIDATED}'
    RETURNING *
  `;

export const RECORD_MIGRATION_BATCH_FAILURE = (schema: string): string => `
    UPDATE ${schema}.migration_batch
    SET preflight_status = '${MIGRATION_STATE.PREFLIGHT_FAILED}',
        failure_code = $3,
        failure_reason = $4,
        failure_file_key = $5,
        updated_at = NOW()
    WHERE migration_batch_id = $1
      AND correlation_id = $2
      AND preflight_status <> '${MIGRATION_STATE.WF1_STARTED}'
  `;
