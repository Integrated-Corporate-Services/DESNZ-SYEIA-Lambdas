import type { Manifest } from '../../src/types/migrationManifest.types';

export interface ManifestInput extends Manifest {
  schemaVersion: '1.0';
  generatedAt: string;
  sourceSystem: 'SHAREPOINT_ONLINE';
}

export function createManifest(overrides: Partial<ManifestInput> = {}): ManifestInput {
  return {
    schemaVersion: '1.0',
    migrationBatchId: 'TEST-BATCH-001',
    ingestionMethod: 'DIRECT_S3',
    generatedAt: '2026-09-03T00:00:00.000Z',
    sourceSystem: 'SHAREPOINT_ONLINE',
    expectedCaseCount: 1,
    expectedDocumentCount: 1,
    casesFile: {
      key: 'migrations/TEST-BATCH-001/cases.csv',
      sizeBytes: 20,
      checksum: 'a'.repeat(64),
      checksumAlgorithm: 'SHA256',
    },
    documents: [
      { key: 'migrations/TEST-BATCH-001/plan.pdf', sizeBytes: 10, checksum: 'b'.repeat(64) },
    ],
    ...overrides,
  };
}
