import type { Pool } from 'pg';
import { RelayService } from '../../src/services/relay.service';
import { sqsRepository } from '../../src/repositories/sqs.repository';
import type { NotifyCallbackEventRow } from '../../src/types';

jest.mock('../../src/repositories/sqs.repository', () => ({
  sqsRepository: { publishNotifyMessage: jest.fn() },
}));
jest.mock('../../src/config/env.config', () => ({ RELAY_BATCH_SIZE: 50 }));
jest.mock('../../src/util/logger', () => ({
  createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const event = (id: string): NotifyCallbackEventRow => ({
  id, notify_notification_id: 'notification-' + id, reference: null, notification_type: 'email',
  status: 'delivered', payload_json: { status: 'delivered' }, processing_status: 'RECEIVED',
  failure_reason: null, correlation_id: 'correlation-' + id,
});

describe('RelayService', () => {
  const publish = jest.mocked(sqsRepository.publishNotifyMessage);
  let client: { query: jest.Mock; release: jest.Mock };
  let queries: jest.Mock;
  let pool: Pool;
  const service = new RelayService();

  beforeEach(() => {
    jest.resetAllMocks();
    client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    queries = jest.fn().mockResolvedValue({ rows: [] });
    pool = { connect: jest.fn().mockResolvedValue(client), query: queries } as unknown as Pool;
    publish.mockResolvedValue(undefined);
  });

  function claimed(events: NotifyCallbackEventRow[]) {
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: events });
  }

  it('commits and releases an empty batch without publishing', async () => {
    await expect(service.execute(pool)).resolves.toEqual({ claimed: 0, enqueued: 0, reverted: 0 });
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    expect(queries).not.toHaveBeenCalled();
  });

  it('commits the claim before publishing and marks both events enqueued', async () => {
    const first = event('event-1'), second = event('event-2');
    claimed([first, second]);
    publish.mockImplementation(async () => {
      expect(client.query).toHaveBeenLastCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledTimes(1);
    });
    await expect(service.execute(pool)).resolves.toEqual({ claimed: 2, enqueued: 2, reverted: 0 });
    expect(publish).toHaveBeenNthCalledWith(1, {
      eventId: first.id, notifyNotificationId: first.notify_notification_id,
      status: first.status, correlationId: first.correlation_id,
    });
    expect(publish).toHaveBeenNthCalledWith(2, {
      eventId: second.id, notifyNotificationId: second.notify_notification_id,
      status: second.status, correlationId: second.correlation_id,
    });
    expect(queries).toHaveBeenNthCalledWith(1, expect.stringContaining("processing_status = 'ENQUEUED'"), [first.id]);
    expect(queries).toHaveBeenNthCalledWith(2, expect.stringContaining("processing_status = 'ENQUEUED'"), [second.id]);
  });

  it('rolls back and releases the connection if claiming fails', async () => {
    const failure = new Error('claim failed');
    client.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure);
    await expect(service.execute(pool)).rejects.toBe(failure);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it('reverts a failed publication for retry and continues with the remaining event', async () => {
    claimed([event('event-1'), event('event-2')]);
    publish.mockRejectedValueOnce(new Error('SQS unavailable'));
    await expect(service.execute(pool)).resolves.toEqual({ claimed: 2, enqueued: 1, reverted: 1 });
    expect(queries).toHaveBeenNthCalledWith(1, expect.stringContaining("processing_status = 'RECEIVED'"), ['event-1']);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('reverts an event if persisting the enqueued state fails after publication', async () => {
    claimed([event('event-1')]);
    queries.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.execute(pool)).resolves.toEqual({ claimed: 1, enqueued: 0, reverted: 1 });
    expect(queries).toHaveBeenLastCalledWith(expect.stringContaining("processing_status = 'RECEIVED'"), ['event-1']);
  });
});
