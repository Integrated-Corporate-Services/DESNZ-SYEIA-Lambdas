import { MIGRATION_DEFAULTS } from '../constants/migrationPreflight.constants';
import { MIGRATION_MESSAGES } from '../constants/migrationPreflight.constants';
import type { AppConfig } from '../types/migrationConfig.types';
export type { AppConfig } from '../types/migrationConfig.types';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(MIGRATION_MESSAGES.MISSING_CONFIGURATION(name));
  return value;
}

export function optionalInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new Error(MIGRATION_MESSAGES.INVALID_NUMBER(name));
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(MIGRATION_MESSAGES.INVALID_NUMBER(name));
  }
  return value;
}

export function assertSafeSqlIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(MIGRATION_MESSAGES.INVALID_SCHEMA(name));
  }
  return name;
}

export function loadConfig(): AppConfig {
  const dbPort = optionalInteger('DB_PORT', MIGRATION_DEFAULTS.databasePort);
  if (dbPort < 1 || dbPort > 65535) {
    throw new Error(MIGRATION_MESSAGES.INVALID_DB_PORT);
  }
  const manifestMaxBytes = optionalInteger(
    'MANIFEST_MAX_BYTES',
    MIGRATION_DEFAULTS.manifestMaxBytes
  );
  const staleAfterSeconds = optionalInteger(
    'PREFLIGHT_CLAIM_STALE_AFTER_SECONDS',
    MIGRATION_DEFAULTS.staleAfterSeconds
  );
  if (manifestMaxBytes < 1 || staleAfterSeconds < 1) {
    throw new Error(MIGRATION_MESSAGES.INVALID_PREFLIGHT_LIMITS);
  }
  return {
    workflowConfig: loadWorkflowConfig(process.env.MIGRATION_WORKFLOW_CONFIG_JSON),
    migrationBucket: required('MIGRATION_LANDING_BUCKET'),
    wf1StateMachineArn: required('MIGRATION_STATE_MACHINE_ARN'),
    dbSecretArn: required('DB_CREDENTIALS'),
    dbHost: required('HOST_NAME'),
    dbPort,
    dbName: required('DB_NAME'),
    migrationPrefixRoot: process.env.MIGRATION_PREFIX_ROOT ?? MIGRATION_DEFAULTS.prefixRoot,
    manifestFilename: process.env.MANIFEST_FILENAME ?? MIGRATION_DEFAULTS.manifestFilename,
    manifestMaxBytes,
    staleAfterSeconds,
    dbSchema: assertSafeSqlIdent(process.env.DB_SCHEMA ?? MIGRATION_DEFAULTS.databaseSchema),
  };
}

export function loadWorkflowConfig(raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(MIGRATION_MESSAGES.INVALID_WORKFLOW_CONFIG);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(MIGRATION_MESSAGES.INVALID_WORKFLOW_CONFIG);
  const names = [
    'ecsClusterArn',
    'runtimeTaskDefinitionArn',
    'runtimeContainerName',
    'approvalHandlerArn',
  ];
  if (
    names.some((name) => typeof value[name] !== 'string' || !value[name]) ||
    !value.networkConfiguration ||
    typeof value.networkConfiguration !== 'object'
  )
    throw new Error(MIGRATION_MESSAGES.WORKFLOW_CONFIG_FIELDS_MISSING);
  return Object.fromEntries([...names, 'networkConfiguration'].map((name) => [name, value[name]]));
}
