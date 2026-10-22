export const MIGRATION_MANIFEST_SCHEMA = {
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
