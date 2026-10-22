import {
  MIGRATION_ERROR_CODE,
  MIGRATION_MESSAGES,
} from '../constants/migrationPreflight.constants';
import type { AppConfig } from '../config/migrationPreflight.config';
import type { S3Store } from '../aws/migrationS3.adapter';
import type { MigrationRequest } from '../types/migrationPreflight.types';
import { parseManifest } from './migrationManifest.validation';
import { MigrationError } from '../errors/migrationPreflight.error';

export async function readMigrationManifest(
  s3: S3Store,
  request: MigrationRequest,
  config: AppConfig
): Promise<ReturnType<typeof parseManifest>> {
  const manifestText = await s3.getText(
    request.bucket,
    request.manifestKey,
    config.manifestMaxBytes
  );
  const parsedManifest = parseManifest(manifestText);
  if (
    parsedManifest.manifest.migrationBatchId !== request.migrationBatchId ||
    parsedManifest.manifest.ingestionMethod !== request.ingestionMethod
  ) {
    throw new MigrationError(
      MIGRATION_ERROR_CODE.INVALID_MANIFEST,
      MIGRATION_MESSAGES.MANIFEST_EVENT_MISMATCH
    );
  }
  return parsedManifest;
}
