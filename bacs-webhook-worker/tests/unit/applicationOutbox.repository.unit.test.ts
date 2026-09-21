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

type QueryStubs = {
  existingOutboxId?: string | null;
  insertedOutboxId?: string | null;
  rejectOn?: 'lookup' | 'insert';
};

function stubQueries({ existingOutboxId = null, insertedOutboxId = 'outbox-1', rejectOn }: QueryStubs = {}) {
  mockClient.query.mockImplementation((sql: string) => {
    if (sql.includes('SELECT outbox_id')) {
      return rejectOn === 'lookup'
        ? Promise.reject(new Error('lookup failed'))
        : Promise.resolve({ rows: existingOutboxId ? [{ outbox_id: existingOutboxId }] : [] });
    }
    if (sql.includes('INSERT INTO application_outbox')) {
      return rejectOn === 'insert'
        ? Promise.reject(new Error('connection lost'))
        : Promise.resolve({ rows: insertedOutboxId ? [{ outbox_id: insertedOutboxId }] : [] });
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

function paramsFor(fragment: string): unknown[] | undefined {
  const call = mockClient.query.mock.calls.find(([sql]) => String(sql).includes(fragment));
  return call?.[1];
}

describe('applicationOutboxRepository.insertOutboxRow', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockClear();
  });

  it('inserts a new row and returns the generated outbox_id', async () => {
    stubQueries();

    const result = await applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1');

    expect(result).toBe('outbox-1');
    expect(paramsFor('INSERT INTO application_outbox')).toEqual([
      'app-1',
      'BACS_PAYMENT_EVENT',
      JSON.stringify(buildParams().payload),
      'idempotency-key-1',
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns the existing outbox_id without a second insert when the idempotency key already exists', async () => {
    stubQueries({ insertedOutboxId: null, existingOutboxId: 'existing-outbox-1' });

    const result = await applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1');

    expect(result).toBe('existing-outbox-1');
    expect(paramsFor('SELECT outbox_id')).toEqual(['idempotency-key-1']);
  });

  it('throws a DatabaseError when the insert query fails', async () => {
    stubQueries({ rejectOn: 'insert' });

    await expect(
      applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');

    expect(mockClient.release).toHaveBeenCalled();
  });

  it('throws a DatabaseError when the fallback lookup fails after a conflict', async () => {
    stubQueries({ insertedOutboxId: null, rejectOn: 'lookup' });

    await expect(
      applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: lookup failed');

    expect(mockClient.release).toHaveBeenCalled();
  });
});
