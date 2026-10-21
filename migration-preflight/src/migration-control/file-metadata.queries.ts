// SQL only. Repositories own connections and bound values.
export const PREFLIGHT_FILE_METADATA_QUERIES = {
  register: (schema: string, reset: boolean): string =>
    `INSERT INTO ${schema}.migration_file_metadata
      (migration_batch_id,source_bucket,source_key,source_file_name,file_kind,expected_size_bytes,expected_checksum,stage)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'PREFLIGHT')
      ${
        reset
          ? `ON CONFLICT (migration_batch_id,legacy_case_id,source_bucket,source_key) DO UPDATE
      SET expected_size_bytes=EXCLUDED.expected_size_bytes,expected_checksum=EXCLUDED.expected_checksum,
          status='PENDING',stage='PREFLIGHT',error_code=NULL,error_message=NULL,updated_at=NOW()`
          : 'ON CONFLICT DO NOTHING'
      }`,

  fail: (schema: string): string =>
    `
      UPDATE ${schema}.migration_file_metadata 
      SET status='FAILED', error_code=$4, error_message=$5, updated_at=NOW()
      
      WHERE migration_batch_id=$1 
        AND source_bucket=$2 
        AND source_key=$3 
        AND legacy_case_id=''`,
} as const;
