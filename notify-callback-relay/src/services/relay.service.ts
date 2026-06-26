import type { Pool, QueryResult } from 'pg';
import { sqsRepository } from '../repositories/sqs.repository';
import { createLogger } from '../util/logger';
import type { NotifyCallbackEventRow, RelayMetrics } from '../types';
import { RELAY_BATCH_SIZE } from '../config/env.config';

const logger = createLogger('relay.service');

/**
 * Relay Service
 * Polls RECEIVED events from database and publishes to SQS
 */
export class RelayService {
  /**
   * Execute relay batch
   * Phase 1: Claim RECEIVED events (atomic transaction)
   * Phase 2: Publish each to SQS and mark ENQUEUED
   */
  async execute(pool: Pool): Promise<RelayMetrics> {
    const metrics: RelayMetrics = { claimed: 0, enqueued: 0, reverted: 0 };

    // Phase 1: Claim RECEIVED events within a transaction
    // FOR UPDATE SKIP LOCKED prevents concurrent relay runs from double-claiming
    const client = await pool.connect();
    let events: NotifyCallbackEventRow[] = [];

    try {
      await client.query('BEGIN');

      const result: QueryResult<NotifyCallbackEventRow> = await client.query(
        `SELECT id, notify_notification_id, reference, notification_type,
                status, payload_json, processing_status, failure_reason, correlation_id
         FROM notify_callback_event
         WHERE processing_status = 'RECEIVED'
         ORDER BY received_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [RELAY_BATCH_SIZE],
      );

      events = result.rows;

      if (events.length === 0) {
        await client.query('COMMIT');
        logger.info('Relay: no RECEIVED events to claim');
        return metrics;
      }

      const ids = events.map((e) => e.id);

      // Mark as ENQUEUING
      await client.query(
        `UPDATE notify_callback_event
         SET processing_status = 'ENQUEUING', updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );

      await client.query('COMMIT');
      metrics.claimed = events.length;

      logger.info('Relay: claimed events', { claimed: metrics.claimed });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Relay: failed to claim events', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }

    // Phase 2: Publish each event to SQS
    for (const event of events) {
      try {
        await sqsRepository.publishNotifyMessage({
          eventId: event.id,
          notifyNotificationId: event.notify_notification_id,
          status: event.status,
          correlationId: event.correlation_id,
        });

        // Mark as ENQUEUED
        await pool.query(
          `UPDATE notify_callback_event
           SET processing_status = 'ENQUEUED',
               enqueued_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [event.id],
        );

        metrics.enqueued++;

        logger.debug('Relay: enqueued event', {
          eventId: event.id,
          notifyNotificationId: event.notify_notification_id,
        });
      } catch (error) {
        logger.error('Relay: failed to enqueue event', {
          eventId: event.id,
          notifyNotificationId: event.notify_notification_id,
          error: error instanceof Error ? error.message : String(error),
        });

        // Revert to RECEIVED so next relay invocation retries
        await pool.query(
          `UPDATE notify_callback_event
           SET processing_status = 'RECEIVED', updated_at = NOW()
           WHERE id = $1`,
          [event.id],
        );

        metrics.reverted++;
      }
    }

    logger.info('Relay: batch complete', {
      claimed: metrics.claimed,
      enqueued: metrics.enqueued,
      reverted: metrics.reverted,
    });

    return metrics;
  }
}

export const relayService = new RelayService();
