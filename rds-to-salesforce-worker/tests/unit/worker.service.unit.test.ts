import type { Pool } from 'pg';
import { WorkerService } from '../../src/services/worker.service';
import { applicationOutboxRepository } from '../../src/repositories/applicationOutbox.repository';
import { salesforceRepository } from '../../src/repositories/salesforce.repository';
import { SalesforceValidationError } from '../../src/errors';

jest.mock('../../src/repositories/applicationOutbox.repository');
jest.mock('../../src/repositories/salesforce.repository');
jest.mock('../../src/config/env.config', () => ({ getMaxRetries: jest.fn().mockResolvedValue(3) }));

const repo = {
  findByOutboxId: jest.fn(),
  markSent: jest.fn(),
  markFatal: jest.fn(),
  recordFailedAttempt: jest.fn(),
};

const pool = {} as Pool;
const message = { outboxId: 'outbox-1', idempotencyKey: 'key-1' } as never;

const pendingRow = (overrides: Record<string, unknown> = {}) => ({
  status: 'QUEUED',
  idempotency_key: 'key-1',
  payload_snapshot_json: { applicationId: 'app-1' },
  ...overrides,
});

describe('WorkerService.processMessage', () => {
  const service = new WorkerService();

  beforeEach(() => {
    jest.clearAllMocks();
    (applicationOutboxRepository as jest.Mock).mockReturnValue(repo);
  });

  it('skips when the outbox row does not exist', async () => {
    repo.findByOutboxId.mockResolvedValue(null);

    await expect(service.processMessage(message, pool)).resolves.toEqual({
      outboxId: 'outbox-1',
      outcome: 'SKIPPED_TERMINAL',
    });
    expect(salesforceRepository.sendPayload).not.toHaveBeenCalled();
  });

  it('marks the row SENT when Salesforce accepts the payload', async () => {
    repo.findByOutboxId.mockResolvedValue(pendingRow());
    (salesforceRepository.sendPayload as jest.Mock).mockResolvedValue({ id: 'sf-1', success: true });

    await expect(service.processMessage(message, pool)).resolves.toEqual({ outboxId: 'outbox-1', outcome: 'SENT' });
    expect(repo.markSent).toHaveBeenCalledWith('outbox-1', 'sf-1', { id: 'sf-1', success: true });
  });

  it('marks the row FATAL when the snapshot cannot be parsed', async () => {
    repo.findByOutboxId.mockResolvedValue(pendingRow({ payload_snapshot_json: '{not-json' }));

    await expect(service.processMessage(message, pool)).resolves.toEqual({ outboxId: 'outbox-1', outcome: 'FATAL' });
    expect(repo.markFatal).toHaveBeenCalledWith('outbox-1', expect.objectContaining({ errorCode: 'INVALID_PAYLOAD' }));
  });

  it('marks the row FATAL on a non-retryable Salesforce error', async () => {
    repo.findByOutboxId.mockResolvedValue(pendingRow());
    (salesforceRepository.sendPayload as jest.Mock).mockRejectedValue(new SalesforceValidationError('bad payload'));

    await expect(service.processMessage(message, pool)).resolves.toEqual({ outboxId: 'outbox-1', outcome: 'FATAL' });
    expect(repo.markFatal).toHaveBeenCalled();
    expect(repo.recordFailedAttempt).not.toHaveBeenCalled();
  });
});
