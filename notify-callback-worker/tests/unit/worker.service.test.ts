import type { Pool } from 'pg';
import { WorkerService } from '../../src/services/worker.service';
import { notifyCallbackRepository } from '../../src/repositories/notifyCallback.repository';
import { sqsRepository } from '../../src/repositories/sqs.repository';
import { FatalEventError, RetryableProcessingError } from '../../src/errors';
import type { NotifyCallbackEventRow } from '../../src/types';

jest.mock('../../src/repositories/notifyCallback.repository', () => ({
  notifyCallbackRepository: jest.fn(),
}));
jest.mock('../../src/repositories/sqs.repository', () => ({
  sqsRepository: { publishFatalMessage: jest.fn() },
}));
jest.mock('../../src/util/logger', () => ({
  createLogger: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('WorkerService', () => {
  const pool = {} as Pool;
  const repo = {
    findById: jest.fn(), markProcessing: jest.fn(), markProcessed: jest.fn(),
    markRetryableFailure: jest.fn(), markFatal: jest.fn(),
  };
  const publishFatal = jest.mocked(sqsRepository.publishFatalMessage);
  const service = new WorkerService();
  let event: NotifyCallbackEventRow;

  beforeEach(() => {
    jest.resetAllMocks();
    event = {
      id: 'event-1', notify_notification_id: 'notification-1', reference: 'application-reference',
      notification_type: 'email', status: 'delivered', payload_json: { status: 'delivered' },
      processing_status: 'ENQUEUED', failure_reason: null, correlation_id: 'correlation-1',
    };
    jest.mocked(notifyCallbackRepository).mockReturnValue(repo);
    repo.findById.mockResolvedValue(event);
    publishFatal.mockResolvedValue(undefined);
  });

  it.each(['delivered', 'permanent-failure', 'temporary-failure', 'technical-failure'])(
    'processes the authoritative database status %s successfully', async status => {
      event.status = status;
      await expect(service.processEvent(event.id, event.correlation_id, pool))
        .resolves.toEqual({ eventId: event.id, outcome: 'PROCESSED' });
      expect(notifyCallbackRepository).toHaveBeenCalledWith(pool);
      expect(repo.findById).toHaveBeenCalledWith(event.id);
      expect(repo.markProcessing).toHaveBeenCalledWith(event.id);
      expect(repo.markProcessed).toHaveBeenCalledWith(event.id);
      expect(repo.markFatal).not.toHaveBeenCalled();
      expect(publishFatal).not.toHaveBeenCalled();
    },
  );

  it.each(['PROCESSED', 'FATAL'])('does not reprocess a terminal %s event', async status => {
    event.processing_status = status;
    await expect(service.processEvent(event.id, null, pool))
      .resolves.toEqual({ eventId: event.id, outcome: 'SKIPPED_TERMINAL' });
    expect(repo.markProcessing).not.toHaveBeenCalled();
    expect(repo.markProcessed).not.toHaveBeenCalled();
    expect(publishFatal).not.toHaveBeenCalled();
  });

  it('rejects an event that does not exist in the database', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.processEvent(event.id, null, pool)).rejects.toBeInstanceOf(FatalEventError);
    expect(repo.markProcessing).not.toHaveBeenCalled();
    expect(publishFatal).not.toHaveBeenCalled();
  });

  it('records a retryable failure and rejects so SQS can redeliver', async () => {
    repo.markProcessed.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(service.processEvent(event.id, null, pool)).rejects.toBeInstanceOf(RetryableProcessingError);
    expect(repo.markRetryableFailure).toHaveBeenCalledWith(event.id, 'ETIMEDOUT');
    expect(repo.markFatal).not.toHaveBeenCalled();
    expect(publishFatal).not.toHaveBeenCalled();
  });

  it('marks an unknown delivery status fatal and forwards the original database payload', async () => {
    event.status = 'unexpected-status';
    await expect(service.processEvent(event.id, null, pool))
      .resolves.toEqual({ eventId: event.id, outcome: 'FATAL' });
    expect(repo.markFatal).toHaveBeenCalledWith(event.id, 'Unknown Notify status: unexpected-status');
    expect(publishFatal).toHaveBeenCalledWith({
      eventId: event.id, notifyNotificationId: event.notify_notification_id,
      reason: 'Unknown Notify status: unexpected-status', originalPayload: event.payload_json,
    });
    expect(repo.markProcessed).not.toHaveBeenCalled();
  });

  it('records an unexpected persistence failure as fatal', async () => {
    repo.markProcessed.mockRejectedValue(new Error('unexpected failure'));
    await expect(service.processEvent(event.id, null, pool))
      .resolves.toEqual({ eventId: event.id, outcome: 'FATAL' });
    expect(repo.markFatal).toHaveBeenCalledWith(event.id, 'Unexpected error: unexpected failure');
    expect(publishFatal).toHaveBeenCalledWith(expect.objectContaining({
      eventId: event.id, reason: 'Unexpected error: unexpected failure',
    }));
  });
});
