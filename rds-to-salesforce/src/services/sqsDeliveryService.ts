/**
 * SQS Delivery Service
 * Orchestrates publishing an outbox job to SQS and marking it queued.
 * Mirrors rds-to-salesforce-worker/src/services/worker.service.ts layering.
 *
 * Reuses the existing util/error.js error classes so err instanceof
 * TransientError checks in outboxService.js's handleJobError keep working
 * against the same class identity - not a parallel/duplicate definition.
 */
import { TransientError, PermanentError } from '../../util/error.js';
import log from '../../util/logger.js';
import { sqsPublisher } from '../repositories/sqsPublisher.repository.js';
import { outboxQueuedRepository } from '../repositories/outboxQueued.repository.js';
import type { OutboxJob, OutboxSqsMessage } from '../types/index.js';

function buildSqsMessage(job: OutboxJob): OutboxSqsMessage {
  return {
    outboxId: job.outbox_id,
    applicationId: job.application_id,
    eventType: job.event_type ?? null,
    enqueuedAt: new Date().toISOString(),
  };
}

function safeJsonParse(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

class SqsDeliveryService {
  async deliver(job: OutboxJob): Promise<void> {
    const snapshot = safeJsonParse(job.payload_snapshot_json);
    if (!snapshot) {
      throw new PermanentError('Invalid snapshot JSON');
    }

    const message = buildSqsMessage(job);
    log.info(`[sqs-delivery] Publishing job to SQS`, { outboxId: job.outbox_id, applicationId: job.application_id });

    let messageId: string;
    try {
      messageId = await sqsPublisher.publish(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error(`[sqs-delivery] Failed to publish to SQS`, { outboxId: job.outbox_id, error: reason });
      throw new TransientError(`Failed to publish to SQS: ${reason}`);
    }

    await outboxQueuedRepository.markQueued(job.outbox_id);
    log.info(`[sqs-delivery] Job queued`, { outboxId: job.outbox_id, messageId });
  }
}

export const sqsDeliveryService = new SqsDeliveryService();
