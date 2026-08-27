import type { Pool } from 'pg';
import { applicationOutboxRepository } from '../repositories/applicationOutbox.repository';
import { salesforceRepository } from '../repositories/salesforce.repository';
import { createLogger } from '../util/logger';
import { getMaxRetries } from '../config/env.config';
import { RetryableProcessingError, SalesforceValidationError, isRetryableError } from '../errors';
import type { ApplicationOutboxRepository, OutboxSqsMessage, WorkerResult } from '../types';
import { TERMINAL_STATUSES, OUTBOX_STATUS } from '../constants';

const logger = createLogger('worker.service');

function safeJsonParse(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export class WorkerService {
  async processDlqMessage(message: OutboxSqsMessage, pool: Pool): Promise<WorkerResult> {
    const repo = applicationOutboxRepository(pool);
    const { outboxId } = message;

    const row = await repo.findByOutboxId(outboxId);
    if (!row) {
      logger.error('DLQ: outbox row not found', { outboxId });
      return { outboxId, outcome: 'SKIPPED_TERMINAL' };
    }

    if ((TERMINAL_STATUSES as readonly string[]).includes(row.status)) {
      logger.info('DLQ: outbox row already terminal - no action needed', { outboxId, status: row.status });
      return { outboxId, outcome: 'SKIPPED_TERMINAL' };
    }

    await repo.markFatal(outboxId, {
      errorCode: 'SQS_DLQ_EXHAUSTED',
      errorMessage: 'Message exhausted SQS delivery attempts without a recorded outcome',
      responsePayload: null,
    });

    return { outboxId, outcome: 'FATAL' };
  }

  async processMessage(message: OutboxSqsMessage, pool: Pool): Promise<WorkerResult> {
    const repo = applicationOutboxRepository(pool);
    const { outboxId } = message;

    const row = await repo.findByOutboxId(outboxId);
    if (!row) {
      logger.error('Outbox row not found - dropping message', { outboxId });
      return { outboxId, outcome: 'SKIPPED_TERMINAL' };
    }

    if ((TERMINAL_STATUSES as readonly string[]).includes(row.status)) {
      logger.info('Outbox row already terminal - skipping', { outboxId, status: row.status });
      return { outboxId, outcome: 'SKIPPED_TERMINAL' };
    }

    if (row.idempotency_key !== message.idempotencyKey) {
      logger.warn('idempotency_key mismatch between SQS message and DB row - proceeding with DB row as authoritative', {
        outboxId,
        messageKey: message.idempotencyKey,
        rowKey: row.idempotency_key,
      });
    }

    const snapshot = safeJsonParse(row.payload_snapshot_json);
    if (!snapshot) {
      await repo.markFatal(outboxId, {
        errorCode: 'INVALID_PAYLOAD',
        errorMessage: 'payload_snapshot_json could not be parsed',
        responsePayload: null,
      });
      return { outboxId, outcome: 'FATAL' };
    }

    try {
      const response = await salesforceRepository.sendPayload(snapshot);
      await repo.markSent(outboxId, response.id ?? '', response as unknown as Record<string, unknown>);
      return { outboxId, outcome: 'SENT' };
    } catch (error) {
      return this.handleSendFailure(outboxId, error, repo);
    }
  }

  private async handleSendFailure(
    outboxId: string,
    error: unknown,
    repo: ApplicationOutboxRepository,
  ): Promise<WorkerResult> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? error.name : 'UNKNOWN_ERROR';
    const responsePayload =
      error instanceof SalesforceValidationError && error.errors ? { errors: error.errors } : null;

    if (!isRetryableError(error)) {
      await repo.markFatal(outboxId, { errorCode, errorMessage, responsePayload });
      logger.error('Non-retryable Salesforce error - marked FATAL', { outboxId, error: errorMessage });
      return { outboxId, outcome: 'FATAL' };
    }

    const maxRetries = await getMaxRetries();
    const result = await repo.recordFailedAttempt(outboxId, { errorCode, errorMessage, responsePayload, maxRetries });

    if (result.status === OUTBOX_STATUS.FATAL) {
      logger.error('Retries exhausted - marked FATAL', { outboxId, attemptCount: result.attemptCount, maxRetries });
      return { outboxId, outcome: 'FATAL' };
    }

    logger.warn('Retryable Salesforce error - will retry', { outboxId, attemptCount: result.attemptCount, maxRetries });
    throw new RetryableProcessingError(errorMessage);
  }
}

export const workerService = new WorkerService();
