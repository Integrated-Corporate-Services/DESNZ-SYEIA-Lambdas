import { paymentWebhooksRepository } from '../repositories/paymentWebhooks.repository';
import { messageBuilderService } from './messageBuilder.service';
import { runtimeConfigService } from './runtimeConfig.service';
import { sqsConfig } from '../config/sqs.config';
import { PoisonMessageError } from '../errors/AppError';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import { ERROR_CODES } from '../constants/error.constants';
import { RELAY_OUTCOME } from '../constants/status.constants';
import type { PaymentWebhookRow, RelayResultItem, RelaySummary } from '../types';

const log = createLogger('relay.service.ts');

const METHOD = {
  EXECUTE: 'execute',
  RELAY_ONE: 'relayOne',
} as const;

class RelayService {
  async execute(): Promise<RelaySummary> {
    log.start(METHOD.EXECUTE);

    const config = await runtimeConfigService.load();
    const rows = await paymentWebhooksRepository.findPending(config.batchSize);

    if (rows.length === 0) {
      log.info(METHOD.EXECUTE, LOG_MESSAGES.RELAY_NO_WEBHOOKS);
      const empty: RelaySummary = { totalSelected: 0, enqueued: 0, poisoned: 0, failed: 0, items: [] };
      log.end(METHOD.EXECUTE, empty);
      return empty;
    }

    log.info(METHOD.EXECUTE, LOG_MESSAGES.RELAY_WEBHOOKS_SELECTED, { count: rows.length });

    const items: RelayResultItem[] = [];
    let enqueued = 0;
    let poisoned = 0;
    let failed = 0;

    for (const row of rows) {
      const item = await this.relayOne(row);
      items.push(item);
      if (item.outcome === RELAY_OUTCOME.ENQUEUED) enqueued++;
      else if (item.outcome === RELAY_OUTCOME.POISONED) poisoned++;
      else failed++;
    }

    const summary: RelaySummary = {
      totalSelected: rows.length,
      enqueued,
      poisoned,
      failed,
      items,
    };
    log.info(METHOD.EXECUTE, LOG_MESSAGES.RELAY_BATCH_COMPLETE, summary);
    log.end(METHOD.EXECUTE);
    return summary;
  }

  private async relayOne(row: PaymentWebhookRow): Promise<RelayResultItem> {
    log.start(METHOD.RELAY_ONE, { webhookId: row.webhook_id });

    // Preserve the Lambda's correlation_id to restore after processing this webhook
    const { setCorrelationId, getCorrelationId } = await import('../util/logger');
    const lambdaCorrelationId = getCorrelationId();

    // Use the database correlation_id for traceability across services
    if (row.correlation_id) {
      setCorrelationId(row.correlation_id);
      log.info(METHOD.RELAY_ONE, LOG_MESSAGES.RELAY_CORRELATION_ID_ADOPTED, {
        webhookId: row.webhook_id,
        dbCorrelationId: row.correlation_id,
      });
    }

    try {
      const envelope = messageBuilderService.build(row);
      const out = await sqsConfig.sendToBacsWebhookRelayQueue({
        body: envelope,
        attributes: {
          WebhookId: row.webhook_id,
          PaymentId: row.payment_id,
          EventType: row.event_type,
          ...(row.correlation_id ? { CorrelationId: row.correlation_id } : {}),
        },
        deduplicationId: row.webhook_id,
      });

      await paymentWebhooksRepository.markEnqueued(row.webhook_id, out.MessageId ?? '');
      log.info(METHOD.RELAY_ONE, LOG_MESSAGES.RELAY_WEBHOOK_ENQUEUED, {
        webhookId: row.webhook_id,
        paymentId: row.payment_id,
        sqsMessageId: out.MessageId,
      });
      const enqueuedItem: RelayResultItem = {
        webhookId: row.webhook_id,
        outcome: RELAY_OUTCOME.ENQUEUED,
        sqsMessageId: out.MessageId,
      };
      log.end(METHOD.RELAY_ONE, { webhookId: row.webhook_id, outcome: enqueuedItem.outcome });
      return enqueuedItem;
    } catch (err) {
      if (err instanceof PoisonMessageError) {
        const reason = err.message;
        try {
          await sqsConfig.sendToBacsWebhookRelayDeadLetterQueue(
            { body: { webhookId: row.webhook_id, paymentId: row.payment_id, error: reason, raw: row.raw_payload } },
            reason,
          );
          await paymentWebhooksRepository.markDeadLetter(row.webhook_id, reason);
        } catch (dlqErr) {
          log.error(METHOD.RELAY_ONE, LOG_MESSAGES.RELAY_POISON_DLQ_FAILED, {
            webhookId: row.webhook_id,
            error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
          });
          const dlqFailedItem: RelayResultItem = {
            webhookId: row.webhook_id,
            outcome: RELAY_OUTCOME.FAILED,
            reason: ERROR_CODES.DLQ_FORWARD_FAILED,
          };
          log.end(METHOD.RELAY_ONE, { webhookId: row.webhook_id, outcome: dlqFailedItem.outcome });
          return dlqFailedItem;
        }
        const poisonedItem: RelayResultItem = {
          webhookId: row.webhook_id,
          outcome: RELAY_OUTCOME.POISONED,
          reason,
        };
        log.end(METHOD.RELAY_ONE, { webhookId: row.webhook_id, outcome: poisonedItem.outcome });
        return poisonedItem;
      }

      log.error(METHOD.RELAY_ONE, LOG_MESSAGES.RELAY_TRANSIENT_FAILURE, {
        webhookId: row.webhook_id,
        error: err instanceof Error ? err.message : String(err),
      });
      const failedItem: RelayResultItem = {
        webhookId: row.webhook_id,
        outcome: RELAY_OUTCOME.FAILED,
        reason: err instanceof Error ? err.message : String(err),
      };
      log.end(METHOD.RELAY_ONE, { webhookId: row.webhook_id, outcome: failedItem.outcome });
      return failedItem;
    } finally {
      // Restore the Lambda's correlation_id
      setCorrelationId(lambdaCorrelationId);
    }
  }
}

export const relayService = new RelayService();
