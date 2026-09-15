const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../../src/repositories/payment.repository', () => ({
  getPool: () => mockPool,
  paymentRepository: {
    findApplicationByInvoiceNumber: jest.fn(),
    findDesnzReferenceByApplicationId: jest.fn(),
  },
}));

import { applicationOutboxRepository } from '../../src/repositories/applicationOutbox.repository';
import { paymentRepository } from '../../src/repositories/payment.repository';
import type { ProcessablePayment } from '../../src/types';

const mockedFindApplicationByInvoiceNumber = paymentRepository.findApplicationByInvoiceNumber as jest.Mock;
const mockedFindDesnzReferenceByApplicationId = paymentRepository.findDesnzReferenceByApplicationId as jest.Mock;

function buildPayment(overrides: Partial<ProcessablePayment> = {}): ProcessablePayment {
  return {
    webhookId: 'webhook-1',
    paymentId: 'payment-123',
    transactionId: 'INV01/NWL00045',
    amount: 100,
    status: 'PAID',
    currency: 'GBP',
    bacsReference: 'BACS-REF-1',
    paymentDate: '2026-01-01',
    eventType: 'PAYMENT_STATUS_UPDATED',
    correlationId: 'correlation-1',
    receivedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('applicationOutboxRepository.insertBacsPaymentEvent', () => {
  beforeEach(() => {
    process.env.ENABLE_APPLICATION_OUTBOX = 'true';
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockClear();
    mockedFindApplicationByInvoiceNumber.mockReset();
    mockedFindDesnzReferenceByApplicationId.mockReset();
  });

  it('skips and returns null when the outbox feature flag is disabled', async () => {
    process.env.ENABLE_APPLICATION_OUTBOX = 'false';

    const result = await applicationOutboxRepository.insertBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBeNull();
    expect(mockedFindApplicationByInvoiceNumber).not.toHaveBeenCalled();
  });

  it('skips and returns null when the payment has no paymentId', async () => {
    const result = await applicationOutboxRepository.insertBacsPaymentEvent(
      buildPayment({ paymentId: '' }),
      'record-1',
    );

    expect(result).toBeNull();
    expect(mockedFindApplicationByInvoiceNumber).not.toHaveBeenCalled();
  });

  it('skips and returns null when no invoice matches the payment reference', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue(null);

    const result = await applicationOutboxRepository.insertBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBeNull();
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('proceeds when the invoice payment_method is not BACS, logging a warning', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'CARD',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ outbox_id: 'outbox-1' }] });

    const result = await applicationOutboxRepository.insertBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBe('outbox-1');
  });

  it('proceeds with desnzReference=null when no desnz_ref is found for the application', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue(null);
    mockClient.query.mockResolvedValueOnce({ rows: [{ outbox_id: 'outbox-1' }] });

    const result = await applicationOutboxRepository.insertBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBe('outbox-1');
    const insertCall = mockClient.query.mock.calls[0];
    const payloadJson = JSON.parse(insertCall[1][2]);
    expect(payloadJson.desnzReference).toBeNull();
  });

  it('inserts a new outbox row and builds the expected payload shape', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockClient.query.mockResolvedValueOnce({ rows: [{ outbox_id: 'outbox-1' }] });

    const payment = buildPayment();
    const result = await applicationOutboxRepository.insertBacsPaymentEvent(payment, 'record-1');

    expect(result).toBe('outbox-1');
    const [, params] = mockClient.query.mock.calls[0];
    const [applicationId, eventType, payloadJsonRaw, idempotencyKey] = params;
    expect(applicationId).toBe('app-1');
    expect(eventType).toBe('BACS_PAYMENT_EVENT');
    expect(typeof idempotencyKey).toBe('string');

    const payloadJson = JSON.parse(payloadJsonRaw);
    expect(payloadJson).toEqual({
      applicationId: 'app-1',
      event_type: 'BACS_PAYMENT_EVENT',
      desnzReference: 'DESNZ-1',
      invoiceNumber: 'INV01/NWL00045',
      payment: {
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        bacsReference: payment.bacsReference,
        paymentReference: 'INV01/NWL00045',
        paymentDate: payment.paymentDate,
        receivedAt: payment.receivedAt,
      },
    });
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns the existing outbox_id without a duplicate insert on an idempotency conflict', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ outbox_id: 'existing-outbox-1' }] });

    const result = await applicationOutboxRepository.insertBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBe('existing-outbox-1');
    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it('throws a DatabaseError and releases the client when the insert query fails', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockClient.query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      applicationOutboxRepository.insertBacsPaymentEvent(buildPayment(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
