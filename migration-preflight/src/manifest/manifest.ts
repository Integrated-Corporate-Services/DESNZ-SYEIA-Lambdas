import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createHash } from 'crypto';
import { MigrationError } from '../errors/migration-error';

export interface Manifest {
  migrationBatchId: string;
  ingestionMethod: 'APPFLOW' | 'DIRECT_S3';
  expectedCaseCount: number;
  expectedDocumentCount: number;
  casesFile: { key: string; sizeBytes: number; checksum: string; checksumAlgorithm: 'SHA256' };
  documents: Array<{ key: string; sizeBytes: number; checksum?: string }>;
}
const schema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'migrationBatchId',
    'ingestionMethod',
    'generatedAt',
    'sourceSystem',
    'expectedCaseCount',
    'expectedDocumentCount',
    'casesFile',
    'documents',
  ],
  properties: {
    schemaVersion: { const: '1.0' },
    migrationBatchId: { type: 'string', minLength: 1 },
    ingestionMethod: { enum: ['APPFLOW', 'DIRECT_S3'] },
    generatedAt: { type: 'string', format: 'date-time' },
    sourceSystem: { const: 'SHAREPOINT_ONLINE' },
    expectedCaseCount: { type: 'integer', minimum: 0 },
    expectedDocumentCount: { type: 'integer', minimum: 0 },
    casesFile: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'sizeBytes', 'checksum', 'checksumAlgorithm'],
      properties: {
        key: { type: 'string' },
        sizeBytes: { type: 'integer', minimum: 0 },
        checksum: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
        checksumAlgorithm: { const: 'SHA256' },
      },
    },
    documents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'sizeBytes'],
        properties: {
          key: { type: 'string' },
          sizeBytes: { type: 'integer', minimum: 0 },
          checksum: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
        },
      },
    },
  },
} as const;
const ajv = new Ajv({ strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
export function parseManifest(raw: string): { manifest: Manifest; sha256: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new MigrationError('INVALID_MANIFEST', 'Manifest is not valid JSON');
  }
  if (!validate(candidate))
    throw new MigrationError('INVALID_MANIFEST', ajv.errorsText(validate.errors));
  const manifest = candidate as Manifest;
  if (manifest.expectedDocumentCount !== manifest.documents.length)
    throw new MigrationError('INVALID_MANIFEST', 'Document count does not match documents array');
  return { manifest, sha256: createHash('sha256').update(raw).digest('hex') };
}
