import {
  selectPendingForRelay,
  updateAfterRelay,
  updateToDeadLetter,
} from '../queries/paymentWebhooks.queries';
import { createLogger } from '../util/logger';
import type { PaymentWebhookRow } from '../types';

const log = createLogger('paymentWebhooks.repository.ts');

const METHOD = {
  FIND_PENDING: 'findPending',
  MARK_ENQUEUED: 'markEnqueued',
  MARK_DEAD_LETTER: 'markDeadLetter',
} as const;

class PaymentWebhooksRepository {
  async findPending(limit: number): Promise<PaymentWebhookRow[]> {
    log.start(METHOD.FIND_PENDING, { limit });
    const rows = await selectPendingForRelay(limit);
    log.end(METHOD.FIND_PENDING, { count: rows.length });
    return rows;
  }

  
  async markEnqueued(webhookId: string, sqsMessageId: string): Promise<void> {
    log.start(METHOD.MARK_ENQUEUED, { webhookId, sqsMessageId });
    await updateAfterRelay(webhookId);
    log.end(METHOD.MARK_ENQUEUED, { webhookId });
  }

  
  async markDeadLetter(webhookId: string, reason: string): Promise<void> {
    log.start(METHOD.MARK_DEAD_LETTER, { webhookId, reason });
    await updateToDeadLetter(webhookId);
    log.end(METHOD.MARK_DEAD_LETTER, { webhookId });
  }
}

export const paymentWebhooksRepository = new PaymentWebhooksRepository();
