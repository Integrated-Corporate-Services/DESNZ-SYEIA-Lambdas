export interface AppConfig {
  migrationBucket: string;
  wf1StateMachineArn: string;
  dbSecretArn: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  migrationPrefixRoot: string;
  manifestFilename: string;
  manifestMaxBytes: number;
  staleAfterSeconds: number;
  dbSchema: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

export function optionalInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new Error(`Invalid numeric configuration: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid numeric configuration: ${name}`);
  }
  return value;
}

export function assertSafeSqlIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid DB_SCHEMA: ${name}`);
  }
  return name;
}

export function loadConfig(): AppConfig {
  const dbPort = optionalInteger('DB_PORT', 5432);
  if (dbPort < 1 || dbPort > 65535) {
    throw new Error('Invalid numeric configuration: DB_PORT');
  }
  const manifestMaxBytes = optionalInteger('MANIFEST_MAX_BYTES', 1048576);
  const staleAfterSeconds = optionalInteger('PREFLIGHT_CLAIM_STALE_AFTER_SECONDS', 3600);
  if (manifestMaxBytes < 1 || staleAfterSeconds < 1) {
    throw new Error('Invalid numeric configuration: size or claim timeout must be positive');
  }
  return {
    migrationBucket: required('MIGRATION_LANDING_BUCKET'),
    wf1StateMachineArn: required('MIGRATION_STATE_MACHINE_ARN'),
    dbSecretArn: required('DB_CREDENTIALS'),
    dbHost: required('HOST_NAME'),
    dbPort,
    dbName: required('DB_NAME'),
    migrationPrefixRoot: process.env.MIGRATION_PREFIX_ROOT ?? 'migrations',
    manifestFilename: process.env.MANIFEST_FILENAME ?? 'manifest.json',
    manifestMaxBytes,
    staleAfterSeconds,
    dbSchema: assertSafeSqlIdent(process.env.DB_SCHEMA ?? 'migration_control'),
  };
}
