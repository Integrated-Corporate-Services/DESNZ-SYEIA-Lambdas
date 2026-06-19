jest.mock('../../src/repositories/paymentWebhooks.repository');
jest.mock('../../src/config/sqs.config');
jest.mock('../../src/services/runtimeConfig.service');

import { relayService } from '../../src/services/relay.service';
import { paymentWebhooksRepository } from '../../src/repositories/paymentWebhooks.repository';
import { sqsConfig } from '../../src/config/sqs.config';
import { runtimeConfigService } from '../../src/services/runtimeConfig.service';
import { RELAY_OUTCOME } from '../../src/constants/status.constants';
import type { PaymentWebhookRow } from '../../src/types';

const mockedRepo = paymentWebhooksRepository as jest.Mocked<typeof paymentWebhooksRepository>;
const mockedSqs  = sqsConfig as jest.Mocked<typeof sqsConfig>;
const mockedCfg  = runtimeConfigService as jest.Mocked<typeof runtimeConfigService>;

function row(overrides: Partial<PaymentWebhookRow> = {}): PaymentWebhookRow {
  return {
    id: 1,
    webhook_id: 'wh_1',
    payment_id: 'pay_1',
    event_type: 'PAYMENT_STATUS_UPDATE',
    status: 'pending',
    raw_payload: { ok: true },
    enqueued_at: null,
    created_by: 'BACS-webhook-receiver',
    updated_by: null,
    correlation_id: null,
    created_at: '2026-06-17T10:00:00.000Z',
    updated_at: '2026-06-17T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockedCfg.load.mockResolvedValue({ batchSize: 25 });
});

describe('RelayService.execute', () => {
  it('returns zero counts when there are no pending rows', async () => {
    mockedRepo.findPending.mockResolvedValue([]);

    const result = await relayService.execute();

    expect(result).toEqual({ totalSelected: 0, enqueued: 0, poisoned: 0, failed: 0, items: [] });
    expect(mockedSqs.sendToBacsWebhookRelayQueue).not.toHaveBeenCalled();
  });

  it('enqueues each pending row and marks it via repository.markEnqueued', async () => {
    mockedRepo.findPending.mockResolvedValue([row({ webhook_id: 'a' }), row({ webhook_id: 'b' })]);
    mockedSqs.sendToBacsWebhookRelayQueue.mockResolvedValue({ MessageId: 'sqs-msg-id' } as Awaited<ReturnType<typeof sqsConfig.sendToBacsWebhookRelayQueue>>);
    mockedRepo.markEnqueued.mockResolvedValue();

    const result = await relayService.execute();

    expect(result.enqueued).toBe(2);
    expect(result.poisoned).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.items.every((i) => i.outcome === RELAY_OUTCOME.ENQUEUED)).toBe(true);
    expect(mockedSqs.sendToBacsWebhookRelayQueue).toHaveBeenCalledTimes(2);
    expect(mockedRepo.markEnqueued).toHaveBeenCalledWith('a', 'sqs-msg-id');
    expect(mockedRepo.markEnqueued).toHaveBeenCalledWith('b', 'sqs-msg-id');
    expect(mockedSqs.sendToBacsWebhookRelayDeadLetterQueue).not.toHaveBeenCalled();
  });

  it('uses webhook_id as the SQS MessageDeduplicationId', async () => {
    mockedRepo.findPending.mockResolvedValue([row({ webhook_id: 'idempotent-key' })]);
    mockedSqs.sendToBacsWebhookRelayQueue.mockResolvedValue({ MessageId: 'm' } as Awaited<ReturnType<typeof sqsConfig.sendToBacsWebhookRelayQueue>>);

    await relayService.execute();

    expect(mockedSqs.sendToBacsWebhookRelayQueue).toHaveBeenCalledWith(
      expect.objectContaining({ deduplicationId: 'idempotent-key' }),
    );
  });

  it('routes poison messages to DLQ and marks them dead_letter', async () => {
    mockedRepo.findPending.mockResolvedValue([row({ raw_payload: 'not-json' })]);
    mockedSqs.sendToBacsWebhookRelayDeadLetterQueue.mockResolvedValue({ MessageId: 'dlq-1' } as Awaited<ReturnType<typeof sqsConfig.sendToBacsWebhookRelayDeadLetterQueue>>);
    mockedRepo.markDeadLetter.mockResolvedValue();

    const result = await relayService.execute();

    expect(result.poisoned).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(result.items[0].outcome).toBe(RELAY_OUTCOME.POISONED);
    expect(mockedSqs.sendToBacsWebhookRelayDeadLetterQueue).toHaveBeenCalledTimes(1);
    expect(mockedRepo.markDeadLetter).toHaveBeenCalledWith('wh_1', expect.any(String));
  });

  it('counts transient SQS failures as "failed" and leaves the row for next invocation', async () => {
    mockedRepo.findPending.mockResolvedValue([row()]);
    mockedSqs.sendToBacsWebhookRelayQueue.mockRejectedValue(new Error('boom'));

    const result = await relayService.execute();

    expect(result.failed).toBe(1);
    expect(result.items[0].outcome).toBe(RELAY_OUTCOME.FAILED);
    expect(mockedRepo.markEnqueued).not.toHaveBeenCalled();
    expect(mockedRepo.markDeadLetter).not.toHaveBeenCalled();
  });
});
