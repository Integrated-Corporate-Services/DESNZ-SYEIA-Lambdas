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
  rejectOn?: 'lock' | 'lookup' | 'insert' | 'rollback';
};

/**
 * Routes on the SQL text rather than call order, so the assertions stay valid
 * regardless of how many transaction statements surround the two real queries.
 */
function stubQueries({ existingOutboxId = null, insertedOutboxId = 'outbox-1', rejectOn }: QueryStubs = {}) {
  mockClient.query.mockImplementation((sql: string) => {
    if (sql === 'ROLLBACK') {
      return rejectOn === 'rollback'
        ? Promise.reject(new Error('rollback failed'))
        : Promise.resolve({ rows: [] });
    }
    if (sql === 'BEGIN' || sql === 'COMMIT') {
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes('pg_advisory_xact_lock')) {
      return rejectOn === 'lock' ? Promise.reject(new Error('lock failed')) : Promise.resolve({ rows: [{}] });
    }
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

function sqlCalls(): string[] {
  return mockClient.query.mock.calls.map(([sql]) => String(sql).trim());
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
    expect(sqlCalls()).toContain('COMMIT');
    expect(sqlCalls()).not.toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('serialises on the idempotency key inside a transaction before reading', async () => {
    stubQueries();

    await applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1');

    const calls = sqlCalls();
    const lockIndex = calls.findIndex((sql) => sql.includes('pg_advisory_xact_lock'));
    const lookupIndex = calls.findIndex((sql) => sql.includes('SELECT outbox_id'));
    const insertIndex = calls.findIndex((sql) => sql.includes('INSERT INTO application_outbox'));

    expect(calls[0]).toBe('BEGIN');
    expect(lockIndex).toBeGreaterThan(0);
    expect(lookupIndex).toBeGreaterThan(lockIndex);
    expect(insertIndex).toBeGreaterThan(lookupIndex);
    expect(paramsFor('pg_advisory_xact_lock')).toEqual(['idempotency-key-1']);
  });

  it('returns the existing outbox_id without inserting when the idempotency key is already recorded', async () => {
    stubQueries({ existingOutboxId: 'existing-outbox-1' });

    const result = await applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1');

    expect(result).toBe('existing-outbox-1');
    expect(sqlCalls().some((sql) => sql.includes('INSERT INTO application_outbox'))).toBe(false);
    expect(sqlCalls()).toContain('COMMIT');
  });

  it('rolls back and throws a DatabaseError when the insert query fails', async () => {
    stubQueries({ rejectOn: 'insert' });

    await expect(
      applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');

    expect(sqlCalls().some((sql) => sql.includes('INSERT INTO application_outbox'))).toBe(true);
    expect(sqlCalls()).toContain('ROLLBACK');
    expect(sqlCalls()).not.toContain('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back and throws a DatabaseError when the idempotency lookup fails', async () => {
    stubQueries({ rejectOn: 'lookup' });

    await expect(
      applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: lookup failed');

    expect(sqlCalls()).toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('still throws the original error when the rollback itself fails', async () => {
    stubQueries({ rejectOn: 'insert' });
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'ROLLBACK') return Promise.reject(new Error('rollback failed'));
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve({ rows: [{}] });
      if (sql.includes('SELECT outbox_id')) return Promise.resolve({ rows: [] });
      return Promise.reject(new Error('connection lost'));
    });

    await expect(
      applicationOutboxRepository.insertOutboxRow(buildParams(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');

    expect(mockClient.release).toHaveBeenCalled();
  });
});
