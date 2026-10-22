import type { IngestionMethod } from './migrationPreflight.types';
import type { Manifest } from './migrationManifest.types';
export interface BatchAdmission {
  migrationBatchId: string;
  manifestKey: string;
  manifestSha256: string;
  ingestionMethod: IngestionMethod;
  correlationId: string;
  staleAfterSeconds: number;
  expectedCaseCount: number;
  expectedDocumentCount: number;
  sourceBucket: string;
  casesFileKey: string;
  documents: Manifest['documents'];
}
