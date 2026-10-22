export interface Manifest {
  migrationBatchId: string;
  ingestionMethod: 'APPFLOW' | 'DIRECT_S3';
  expectedCaseCount: number;
  expectedDocumentCount: number;
  casesFile: { key: string; sizeBytes: number; checksum: string; checksumAlgorithm: 'SHA256' };
  documents: Array<{ key: string; sizeBytes: number; checksum?: string }>;
}
