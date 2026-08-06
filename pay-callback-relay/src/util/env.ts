import log from './logger';
import { getDbHost, getDbName, hasDbCredentialsConfigured } from './dbConfig';

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

export function validateEnvVars(): void {
  const missing: string[] = [];

  if (!getDbHost()) {
    missing.push('HOST_NAME');
  }

  if (!getDbName()) {
    missing.push('DB_NAME');
  }

  if (!hasDbCredentialsConfigured()) {
    missing.push('DB_CREDENTIALS');
  }

  if (!hasEnv('DB_PORT')) {
    missing.push('DB_PORT');
  }

  if (!hasEnv('REGION')) {
    missing.push('REGION');
  }

  if (!hasEnv('SQS_QUEUE_URL')) {
    missing.push('SQS_QUEUE_URL');
  }

  if (missing.length > 0) {
    log.error('[env] Missing required environment variables', { missing });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  log.info('[env] Environment variables validated successfully');
}
