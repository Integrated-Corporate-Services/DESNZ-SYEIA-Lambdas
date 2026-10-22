import {
  MIGRATION_ERROR_CODE,
  MIGRATION_MESSAGES,
} from '../constants/migrationPreflight.constants';
import { S3Store } from '../aws/migrationAws.exports';
import { MigrationError } from '../errors/migrationPreflight.error';
import { Manifest } from './migrationManifest.validation';

export function packageFiles(manifest: Manifest) {
  return [manifest.casesFile, ...manifest.documents];
}

export function validatePackageKeys(manifest: Manifest, prefix: string): void {
  const files = packageFiles(manifest);
  if (new Set(files.map((file) => file.key)).size !== files.length)
    throw new MigrationError(
      MIGRATION_ERROR_CODE.INVALID_MANIFEST,
      MIGRATION_MESSAGES.DUPLICATE_PACKAGE_KEYS
    );
  for (const file of files) {
    if (
      !file.key.startsWith(prefix + '/') ||
      /(^|\/)\.\.?($|\/)|\\|\/\//.test(file.key) ||
      file.key.startsWith('/')
    )
      throw new MigrationError(
        MIGRATION_ERROR_CODE.INVALID_MANIFEST,
        MIGRATION_MESSAGES.UNSAFE_PACKAGE_KEY
      );
  }
}
export async function validatePackageFile(
  s3: S3Store,
  bucket: string,
  file: { key: string; sizeBytes: number; checksum?: string }
): Promise<void> {
  const head = await s3.head(bucket, file.key);
  if (head.size !== file.sizeBytes)
    throw new MigrationError(
      MIGRATION_ERROR_CODE.MISSING_FILE,
      MIGRATION_MESSAGES.FILE_SIZE_MISMATCH
    );
  if (file.checksum && head.checksum?.toLowerCase() !== file.checksum.toLowerCase())
    throw new MigrationError(
      MIGRATION_ERROR_CODE.CHECKSUM_MISMATCH,
      MIGRATION_MESSAGES.FILE_CHECKSUM_MISMATCH
    );
}
