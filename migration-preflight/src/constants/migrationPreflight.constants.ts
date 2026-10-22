export const MIGRATION_ERROR_CODE = {
  UNKNOWN: 'UNKNOWN',
  UNSUPPORTED_EVENT: 'UNSUPPORTED_EVENT',
  INVALID_MANIFEST: 'INVALID_MANIFEST',
  MISSING_FILE: 'MISSING_FILE',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  MANIFEST_NOT_FOUND: 'MANIFEST_NOT_FOUND',
} as const;

export const MIGRATION_STATE = {
  DIRECT_S3: 'DIRECT_S3',
  APPFLOW: 'APPFLOW',
  ALREADY_STARTED: 'ALREADY_STARTED',
  WF1_STARTED: 'WF1_STARTED',
  PREFLIGHT_FAILED: 'PREFLIGHT_FAILED',
  IN_PROGRESS_ELSEWHERE: 'IN_PROGRESS_ELSEWHERE',
  PREFLIGHT_IN_PROGRESS: 'PREFLIGHT_IN_PROGRESS',
  SKIPPED: 'SKIPPED',
} as const;

export const MIGRATION_MESSAGES = {
  INVALID_DB_PORT: 'Invalid numeric configuration: DB_PORT',
  INVALID_PREFLIGHT_LIMITS: 'Invalid numeric configuration: size or claim timeout must be positive',
  INVALID_WORKFLOW_CONFIG: 'Invalid MIGRATION_WORKFLOW_CONFIG_JSON',
  WORKFLOW_CONFIG_FIELDS_MISSING:
    'MIGRATION_WORKFLOW_CONFIG_JSON requires ECS, approval and network configuration',
  SECRET_VALUE_MISSING: 'Database secret has no SecretString',
  SECRET_CREDENTIALS_MISSING: 'DB_CREDENTIALS secret must contain username and password',
  INVALID_EVENT: 'Event must be an object',
  INVALID_ENCODED_KEY: 'Invalid encoded S3 object key',
  EVENT_OBJECT_MISSING: 'Event has no actionable S3 object',
  NOT_MIGRATION_MANIFEST: 'Event is not a migration manifest',
  APPFLOW_NOT_SUCCESSFUL: 'AppFlow event is not a successful flow completion',
  INVALID_MANIFEST_JSON: 'Manifest is not valid JSON',
  DOCUMENT_COUNT_MISMATCH: 'Document count does not match documents array',
  DUPLICATE_PACKAGE_KEYS: 'Manifest has duplicate package keys',
  UNSAFE_PACKAGE_KEY: 'Manifest has an unsafe package key',
  FILE_SIZE_MISMATCH: 'Declared file size does not match S3',
  FILE_CHECKSUM_MISMATCH: 'Declared file checksum does not match S3',
  MANIFEST_NOT_FOUND: 'Manifest is missing',
  MANIFEST_TOO_LARGE: 'Manifest exceeds configured maximum size',
  PACKAGE_FILE_NOT_FOUND: 'Declared package file is missing',
  EXECUTION_ALREADY_EXISTS: 'Step Functions execution already exists',
  MANIFEST_EVENT_MISMATCH: 'Manifest does not match event',
  PREFLIGHT_COMPLETED: 'migration.preflight.completed',
  PREFLIGHT_REJECTED: 'migration.preflight.rejected',
  MISSING_CONFIGURATION: (name: string): string => `Missing required configuration: ${name}`,
  INVALID_NUMBER: (name: string): string => `Invalid numeric configuration: ${name}`,
  INVALID_SCHEMA: (name: string): string => `Invalid DB_SCHEMA: ${name}`,
} as const;

export const MIGRATION_DEFAULTS = {
  databasePort: 5432,
  databaseSchema: 'migration_control',
  prefixRoot: 'migrations',
  manifestFilename: 'manifest.json',
  manifestMaxBytes: 1048576,
  staleAfterSeconds: 3600,
  poolMaxConnections: 4,
  failureMessageMaxLength: 2000,
  executionHashLength: 16,
  logKeyDigestLength: 16,
} as const;
