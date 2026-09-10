import { createHash } from 'crypto';
import pino from 'pino';

export function createLogger(): pino.Logger {
  return pino({ level: process.env.LOG_LEVEL ?? 'info' });
}

export function withMigrationContext(
  logger: pino.Logger,
  context: { migrationBatchId: string | null; correlationId: string; objectKey?: string }
): pino.Logger {
  return logger.child({
    migrationBatchId: context.migrationBatchId,
    correlationId: context.correlationId,
    objectKeyDigest: context.objectKey
      ? createHash('sha256').update(context.objectKey).digest('hex').slice(0, 16)
      : undefined,
  });
}
