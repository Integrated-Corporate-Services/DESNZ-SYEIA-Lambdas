const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../../src/repositories/payment.repository', () => ({
  getPool: () => mockPool,
}));

import { applicationOutboxRepository } from '../../src/repositories/applicationOutbox.repository';
import type { InsertBacsPaymentOutboxParams } from '../../src/types/applicationOutbox.types';

function buildParams(overrides: Partial<InsertBacsPaymentOutboxParams> = {}): InsertBacsPaymentOutboxParams {
  return {
    applicationId: 'app-1',
    eventType: 'BACS_PAYMENT_EVENT',
    idempotencyKey: 'idempotency-key-1',
    payload: {
      applicationId: 'app-1',
      event_type: 'BACS_PAYMENT_EVENT',
      desnzReference: 'DESNZ-1',
      invoiceNumber: 'INV01/NWL00045',
      payment: {
        amount: 100,
        currency: 'GBP',
        status: 'PAID',
        bacsReference: 'BACS-REF-1',
        paymentReference: 'INV01/NWL00045',
        paymentDate: '2026-01-01',
        receivedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    ...overrides,
  };
}

describe('applicationOutboxRepository.insertOutboxRow', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockClear();
  });

  it('inserts a new row and returns the generated outbox_id', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ outbox_id: 'outbox-1' }] });

    const result = await applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1');

    expect(result).toBe('outbox-1');
    expect(mockClient.query).toHaveBeenCalledTimes(2);
    const [, params] = mockClient.query.mock.calls[1];
    expect(params).toEqual(['app-1', 'BACS_PAYMENT_EVENT', JSON.stringify(buildParams().payload), 'idempotency-key-1']);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns the existing outbox_id without inserting when the idempotency key is already recorded', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ outbox_id: 'existing-outbox-1' }] });

    const result = await applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1');

    expect(result).toBe('existing-outbox-1');
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it('throws a DatabaseError and releases the client when the insert query fails', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
