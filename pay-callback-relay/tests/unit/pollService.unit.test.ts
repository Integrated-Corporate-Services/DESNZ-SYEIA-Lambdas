import { pollAndEnqueueWebhooks } from '../../src/services/pollService';
import * as webhookRepo from '../../src/repositories/webhookRepository';
import * as sqsService from '../../src/services/sqsService';

describe('pollAndEnqueueWebhooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return no unenqueued webhooks', async () => {
    jest.spyOn(webhookRepo, 'getUnenqueuedWebhooks').mockResolvedValue([]);
    const result = await pollAndEnqueueWebhooks();
    expect(result.message).toMatch(/no unenqueued/i);
    expect(result.results).toEqual([]);
  });

  it('should enqueue webhooks and mark as enqueued', async () => {
    const webhook = {
      webhook_id: 'id1',
      payment_id: 'pid1',
      event_type: 'PAYMENT',
      status: 'processing',
      raw_payload: '{}',
      correlation_id: null,
    };
    jest.spyOn(webhookRepo, 'getUnenqueuedWebhooks').mockResolvedValue([webhook]);
    jest.spyOn(sqsService, 'enqueueWebhookToSQS').mockResolvedValue({ webhookId: 'id1', success: true });
    const markSpy = jest.spyOn(webhookRepo, 'markWebhookEnqueued').mockResolvedValue();
    const result = await pollAndEnqueueWebhooks();
    expect(result.results[0].success).toBe(true);
    expect(markSpy).toHaveBeenCalledWith('id1');
  });

  it('should handle SQS enqueue failure', async () => {
    const webhook = {
      webhook_id: 'id2',
      payment_id: 'pid2',
      event_type: 'PAYMENT',
      status: 'processing',
      raw_payload: '{}',
      correlation_id: null,
    };
    jest.spyOn(webhookRepo, 'getUnenqueuedWebhooks').mockResolvedValue([webhook]);
    jest.spyOn(sqsService, 'enqueueWebhookToSQS').mockResolvedValue({ webhookId: 'id2', success: false, error: 'SQS error' });
    const markSpy = jest.spyOn(webhookRepo, 'markWebhookEnqueued').mockResolvedValue();
    const result = await pollAndEnqueueWebhooks();
    expect(result.results[0].success).toBe(false);
    expect(markSpy).not.toHaveBeenCalled();
  });
});
