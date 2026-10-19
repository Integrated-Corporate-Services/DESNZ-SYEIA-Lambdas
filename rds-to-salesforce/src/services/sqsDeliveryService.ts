import { TransientError, PermanentError } from '../../util/error.js';
import log from '../../util/logger.js';
import { sqsPublisher } from '../repositories/sqsPublisher.repository.js';
import { outboxQueuedRepository } from '../repositories/outboxQueued.repository.js';
import type { OutboxJob, OutboxSqsMessage, SqsMessageAttributes } from '../types/index.js';

function buildSqsMessage(job: OutboxJob): OutboxSqsMessage {
  return {
    outboxId: job.outbox_id,
    applicationId: job.application_id ?? null,
    applicantId: job.user_id ?? null,
    eventType: job.event_type,
    idempotencyKey: job.idempotency_key,
    enqueuedAt: new Date().toISOString(),
  };
}

function buildSqsMessageAttributes(message: OutboxSqsMessage): SqsMessageAttributes {
  const attributes: SqsMessageAttributes = {
    outboxId: { DataType: 'String', StringValue: String(message.outboxId) },
    eventType: { DataType: 'String', StringValue: message.eventType },
  };
  if (message.applicationId) {
    attributes.applicationId = { DataType: 'String', StringValue: message.applicationId };
  }
  if (message.applicantId) {
    attributes.applicantId = { DataType: 'String', StringValue: message.applicantId };
  }
  return attributes;
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
    const start = Date.now();
    const outboxId = job.outbox_id;
    log.info(`[SQS_DELIVERY][SERVICE][DELIVER][START] - delivering outbox job eventType=${job.event_type} - outboxId=${outboxId}`);

    const snapshot = safeJsonParse(job.payload_snapshot_json);
    if (!snapshot) {
      log.error(`[SQS_DELIVERY][SERVICE][VALIDATE_SNAPSHOT][FAILED] - invalid snapshot JSON - outboxId=${outboxId}`);
      throw new PermanentError('Invalid snapshot JSON');
    }

    if (!job.application_id && !job.user_id) {
      log.error(`[SQS_DELIVERY][SERVICE][VALIDATE_JOB][FAILED] - neither application_id nor user_id present - outboxId=${outboxId}`);
      throw new PermanentError('Outbox job has neither application_id nor user_id');
    }

    const message = buildSqsMessage(job);
    log.info(`[SQS_DELIVERY][SERVICE][PUBLISH][START] - publishing to SQS applicationId=${job.application_id ?? 'none'} applicantId=${job.user_id ?? 'none'} - outboxId=${outboxId}`);

    let messageId: string;
    try {
      messageId = await sqsPublisher.publish(message, buildSqsMessageAttributes(message));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error(`[SQS_DELIVERY][SERVICE][PUBLISH][FAILED] - error=${reason} - outboxId=${outboxId}`);
      throw new TransientError(`Failed to publish to SQS: ${reason}`);
    }

    try {
      await outboxQueuedRepository.markQueued(outboxId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.error(`[SQS_DELIVERY][SERVICE][MARK_ENQUEUED][FAILED] - error=${reason} messageId=${messageId} - outboxId=${outboxId}`);
      throw new TransientError(`Failed to mark job as ENQUEUED: ${reason}`);
    }
    log.info(`[SQS_DELIVERY][SERVICE][DELIVER][END] - job enqueued messageId=${messageId} durationMs=${Date.now() - start} - outboxId=${outboxId}`);
  }
}

export const sqsDeliveryService = new SqsDeliveryService();
