import { S3Store } from '../aws/stores';
import { MigrationError } from '../errors/migration-error';
import { Manifest } from './manifest';
export function packageFiles(manifest: Manifest) {
  return [manifest.casesFile, ...manifest.documents];
}
export function validatePackageKeys(manifest: Manifest, prefix: string): void {
  const files = packageFiles(manifest);
  if (new Set(files.map((file) => file.key)).size !== files.length)
    throw new MigrationError('INVALID_MANIFEST', 'Manifest has duplicate package keys');
  for (const file of files) {
    if (
      !file.key.startsWith(prefix + '/') ||
      /(^|\/)\.\.?($|\/)|\\|\/\//.test(file.key) ||
      file.key.startsWith('/')
    )
      throw new MigrationError('INVALID_MANIFEST', 'Manifest has an unsafe package key');
  }
}
export async function validatePackageFile(
  s3: S3Store,
  bucket: string,
  file: { key: string; sizeBytes: number; checksum?: string }
): Promise<void> {
  const head = await s3.head(bucket, file.key);
  if (head.size !== file.sizeBytes)
    throw new MigrationError('MISSING_FILE', 'Declared file size does not match S3');
  if (file.checksum && head.checksum?.toLowerCase() !== file.checksum.toLowerCase())
    throw new MigrationError('CHECKSUM_MISMATCH', 'Declared file checksum does not match S3');
}
