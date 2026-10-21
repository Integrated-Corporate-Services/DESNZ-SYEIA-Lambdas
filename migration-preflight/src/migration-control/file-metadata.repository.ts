import { PREFLIGHT_FILE_METADATA_QUERIES } from './file-metadata.queries';
import { Pool } from 'pg';
import { assertSafeSqlIdent } from '../config/config';

export class FileMetadataRepository {
  private readonly schema: string;
  constructor(
    private readonly db: Pool,
    schema: string
  ) {
    this.schema = assertSafeSqlIdent(schema);
  }

  async register(
    batchId: string,
    bucket: string,
    key: string,
    kind: 'MANIFEST' | 'CASES' | 'DOCUMENT',
    size?: number,
    checksum?: string,
    reset = true
  ): Promise<void> {
    await this.db.query(PREFLIGHT_FILE_METADATA_QUERIES.register(this.schema, reset), [
      batchId,
      bucket,
      key,
      key.split('/').at(-1) ?? key,
      kind,
      size ?? null,
      checksum ?? null,
    ]);
  }

  async fail(
    batchId: string,
    bucket: string,
    key: string,
    code: string,
    reason: string
  ): Promise<void> {
    await this.db.query(PREFLIGHT_FILE_METADATA_QUERIES.fail(this.schema), [
      batchId,
      bucket,
      key,
      code,
      reason.slice(0, 2000),
    ]);
  }
}
