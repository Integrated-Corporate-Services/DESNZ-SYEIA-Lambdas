import {
  MIGRATION_ERROR_CODE,
  MIGRATION_MESSAGES,
} from '../constants/migrationPreflight.constants';
import { MIGRATION_MANIFEST_SCHEMA } from '../constants/migrationManifest.schema';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createHash } from 'crypto';
import { MigrationError } from '../errors/migrationPreflight.error';

import type { Manifest } from '../types/migrationManifest.types';
export type { Manifest } from '../types/migrationManifest.types';
const ajv = new Ajv({ strict: true });
addFormats(ajv);
const validate = ajv.compile(MIGRATION_MANIFEST_SCHEMA);
export function parseManifest(raw: string): { manifest: Manifest; sha256: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new MigrationError(
      MIGRATION_ERROR_CODE.INVALID_MANIFEST,
      MIGRATION_MESSAGES.INVALID_MANIFEST_JSON
    );
  }
  if (!validate(candidate))
    throw new MigrationError(
      MIGRATION_ERROR_CODE.INVALID_MANIFEST,
      ajv.errorsText(validate.errors)
    );
  const manifest = candidate as Manifest;
  if (manifest.expectedDocumentCount !== manifest.documents.length)
    throw new MigrationError(
      MIGRATION_ERROR_CODE.INVALID_MANIFEST,
      MIGRATION_MESSAGES.DOCUMENT_COUNT_MISMATCH
    );
  return { manifest, sha256: createHash('sha256').update(raw).digest('hex') };
}
