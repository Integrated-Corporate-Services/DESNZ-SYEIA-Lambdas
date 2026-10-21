import { Pool } from 'pg';
import { assertSafeSqlIdent } from '../config/config';
export class FileMetadataRepository {
  private readonly schema: string;
  constructor(private readonly db: Pool, schema: string) { this.schema = assertSafeSqlIdent(schema); }
  async register(batchId: string, bucket: string, key: string, kind: 'MANIFEST'|'CASES'|'DOCUMENT', size?: number, checksum?: string): Promise<void> {
    await this.db.query(`INSERT INTO ${this.schema}.migration_file_metadata
      (migration_batch_id,source_bucket,source_key,source_file_name,file_kind,expected_size_bytes,expected_checksum,stage)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'PREFLIGHT')
      ON CONFLICT (migration_batch_id,legacy_case_id,source_bucket,source_key) DO UPDATE
      SET expected_size_bytes=EXCLUDED.expected_size_bytes,expected_checksum=EXCLUDED.expected_checksum,
          status='PENDING',stage='PREFLIGHT',error_code=NULL,error_message=NULL,updated_at=NOW()`,
      [batchId,bucket,key,key.split('/').at(-1) ?? key,kind,size ?? null,checksum ?? null]);
  }
  async fail(batchId: string,bucket: string,key: string,code: string,reason: string): Promise<void> {
    await this.db.query(`UPDATE ${this.schema}.migration_file_metadata SET status='FAILED',error_code=$4,error_message=$5,updated_at=NOW()
      WHERE migration_batch_id=$1 AND source_bucket=$2 AND source_key=$3 AND legacy_case_id=''`,
      [batchId,bucket,key,code,reason.slice(0,2000)]);
  }
}
