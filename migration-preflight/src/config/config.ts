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

export function loadConfig(): AppConfig {
  return {
    migrationBucket: required('MIGRATION_LANDING_BUCKET'),
    wf1StateMachineArn: required('MIGRATION_STATE_MACHINE_ARN'),
    dbSecretArn: required('DB_CREDENTIALS'),
    dbHost: required('HOST_NAME'),
    dbPort: Number(process.env.DB_PORT ?? 5432),
    dbName: required('DB_NAME'),
    migrationPrefixRoot: process.env.MIGRATION_PREFIX_ROOT ?? 'migrations',
    manifestFilename: process.env.MANIFEST_FILENAME ?? 'manifest.json',
    manifestMaxBytes: Number(process.env.MANIFEST_MAX_BYTES ?? 1048576),
    staleAfterSeconds: Number(process.env.PREFLIGHT_CLAIM_STALE_AFTER_SECONDS ?? 3600),
    dbSchema: process.env.DB_SCHEMA ?? 'migration_control',
  };
}
