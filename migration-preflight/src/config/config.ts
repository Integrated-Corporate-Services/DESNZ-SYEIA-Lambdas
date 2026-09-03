export interface AppConfig {
  migrationBucket: string;
  wf1StateMachineArn: string;
  databaseUrl?: string;
  dbSecretArn?: string;
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
    migrationBucket: required('MIGRATION_BUCKET'),
    wf1StateMachineArn: required('WF1_STATE_MACHINE_ARN'),
    databaseUrl: process.env.DATABASE_URL,
    dbSecretArn: process.env.DB_SECRET_ARN,
    migrationPrefixRoot: process.env.MIGRATION_PREFIX_ROOT ?? 'migrations',
    manifestFilename: process.env.MANIFEST_FILENAME ?? 'manifest.json',
    manifestMaxBytes: Number(process.env.MANIFEST_MAX_BYTES ?? 1048576),
    staleAfterSeconds: Number(process.env.PREFLIGHT_CLAIM_STALE_AFTER_SECONDS ?? 3600),
    dbSchema: process.env.DB_SCHEMA ?? 'migration_control',
  };
}
