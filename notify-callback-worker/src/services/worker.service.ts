import type { Pool } from 'pg';
import { notifyCallbackRepository } from '../repositories/notifyCallback.repository';
import { sqsRepository } from '../repositories/sqs.repository';
import { createLogger } from '../util/logger';
import { RetryableProcessingError, FatalEventError, isRetryableError } from '../errors';
import type { WorkerResult, NotifyStatus } from '../types';
import { TERMINAL_STATUSES } from '../constants';

const logger = createLogger('worker.service');

/**
 * Worker Service
 * Processes notify callback events from SQS
 */
export class WorkerService {
  /**
   * Apply business logic based on GOV.UK Notify delivery status
   */
  private async applyBusinessLogic(
    eventId: string,
    notifyNotificationId: string,
    status: string,
    notificationType: string,
    reference: string | null,
    correlationId: string | null,
  ): Promise<void> {
    const notifyStatus = status as NotifyStatus;

    logger.info('Worker: applying business logic', {
      eventId,
      notifyNotificationId,
      status: notifyStatus,
      notificationType,
      reference,
      correlationId,
    });

    // Business logic per delivery status
    switch (notifyStatus) {
      case 'delivered':
        // Update notification status to delivered
        // This would typically update another table or call another service
        logger.info('Worker: notification delivered', {
          eventId,
          notifyNotificationId,
          reference,
        });
        break;

      case 'permanent-failure':
        // Mark notification as permanently failed
        // May need to alert operations or update user-facing status
        logger.warn('Worker: permanent delivery failure', {
          eventId,
          notifyNotificationId,
          reference,
        });
        break;

      case 'temporary-failure':
        // Log temporary failure - do NOT auto-resend
        // GOV.UK Notify will retry automatically
        logger.warn('Worker: temporary delivery failure', {
          eventId,
          notifyNotificationId,
          reference,
        });
        break;

      case 'technical-failure':
        // Log technical failure - may need operational attention
        logger.error('Worker: technical delivery failure', {
          eventId,
          notifyNotificationId,
          reference,
        });
        break;

      default:
        // Unknown status - treat as fatal
        throw new FatalEventError(`Unknown Notify status: ${status}`);
    }
  }

  /**
   * Process a single notify callback event from SQS
   */
  async processEvent(
    eventId: string,
    correlationId: string | null,
    pool: Pool,
  ): Promise<WorkerResult> {
    const repo = notifyCallbackRepository(pool);

    // Load authoritative event from DB (never trust SQS payload alone)
    const event = await repo.findById(eventId);

    if (!event) {
      throw new FatalEventError(`Event not found in DB: ${eventId}`);
    }

    // Idempotency guard — skip if already in a terminal state
    if ((TERMINAL_STATUSES as readonly string[]).includes(event.processing_status)) {
      logger.info('Worker: event already in terminal state — skipping', {
        eventId,
        correlationId,
        processingStatus: event.processing_status,
      });
      return { eventId, outcome: 'SKIPPED_TERMINAL' };
    }

    // Mark as processing
    await repo.markProcessing(eventId);

    logger.info('Worker: processing event', {
      eventId,
      correlationId,
      notifyNotificationId: event.notify_notification_id,
      status: event.status,
      notificationType: event.notification_type,
    });

    try {
      // Apply business logic
      await this.applyBusinessLogic(
        eventId,
        event.notify_notification_id,
        event.status,
        event.notification_type,
        event.reference,
        correlationId,
      );

      // Mark as processed
      await repo.markProcessed(eventId);

      logger.info('Worker: event processed successfully', {
        eventId,
        correlationId,
        notifyNotificationId: event.notify_notification_id,
      });

      return { eventId, outcome: 'PROCESSED' };
    } catch (error) {
      // Check if error is retryable
      if (isRetryableError(error)) {
        const reason = error instanceof Error ? error.message : String(error);

        logger.warn('Worker: retryable error occurred', {
          eventId,
          correlationId,
          error: reason,
        });

        await repo.markRetryableFailure(eventId, reason);

        // Throw so SQS redelivers
        throw new RetryableProcessingError(reason);
      }

      // Non-retryable error - mark as fatal
      if (error instanceof FatalEventError) {
        logger.error('Worker: fatal event detected', {
          eventId,
          correlationId,
          reason: error.message,
        });

        await repo.markFatal(eventId, error.message);

        // Publish to fatal DLQ
        await sqsRepository.publishFatalMessage({
          eventId,
          notifyNotificationId: event.notify_notification_id,
          reason: error.message,
          originalPayload: event.payload_json,
        });

        return { eventId, outcome: 'FATAL' };
      }

      // Unknown error - treat as fatal
      const reason = error instanceof Error ? error.message : String(error);

      logger.error('Worker: unexpected error - marking as fatal', {
        eventId,
        correlationId,
        error: reason,
        stack: error instanceof Error ? error.stack : undefined,
      });

      await repo.markFatal(eventId, `Unexpected error: ${reason}`);

      await sqsRepository.publishFatalMessage({
        eventId,
        notifyNotificationId: event.notify_notification_id,
        reason: `Unexpected error: ${reason}`,
        originalPayload: event.payload_json,
      });

      return { eventId, outcome: 'FATAL' };
    }
  }
}

export const workerService = new WorkerService();
