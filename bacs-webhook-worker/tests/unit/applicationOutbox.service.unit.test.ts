jest.mock('../../src/repositories/payment.repository', () => ({
  paymentRepository: {
    findApplicationByInvoiceNumber: jest.fn(),
    findDesnzReferenceByApplicationId: jest.fn(),
  },
}));

jest.mock('../../src/repositories/applicationOutbox.repository', () => ({
  applicationOutboxRepository: {
    insertOutboxRow: jest.fn(),
  },
}));

import { applicationOutboxService } from '../../src/services/applicationOutbox.service';
import { paymentRepository } from '../../src/repositories/payment.repository';
import { applicationOutboxRepository } from '../../src/repositories/applicationOutbox.repository';
import type { ProcessablePayment } from '../../src/types';

const mockedFindApplicationByInvoiceNumber = paymentRepository.findApplicationByInvoiceNumber as jest.Mock;
const mockedFindDesnzReferenceByApplicationId = paymentRepository.findDesnzReferenceByApplicationId as jest.Mock;
const mockedInsertOutboxRow = applicationOutboxRepository.insertOutboxRow as jest.Mock;

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

describe('applicationOutboxService.recordBacsPaymentEvent', () => {
  beforeEach(() => {
    process.env.ENABLE_APPLICATION_OUTBOX = 'true';
    mockedFindApplicationByInvoiceNumber.mockReset();
    mockedFindDesnzReferenceByApplicationId.mockReset();
    mockedInsertOutboxRow.mockReset();
  });

  it('skips and returns null when the outbox feature flag is disabled', async () => {
    process.env.ENABLE_APPLICATION_OUTBOX = 'false';

    const result = await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBeNull();
    expect(mockedFindApplicationByInvoiceNumber).not.toHaveBeenCalled();
  });

  it('skips and returns null when the payment has no paymentId', async () => {
    const result = await applicationOutboxService.recordBacsPaymentEvent(
      buildPayment({ paymentId: '' }),
      'record-1',
    );

    expect(result).toBeNull();
    expect(mockedFindApplicationByInvoiceNumber).not.toHaveBeenCalled();
  });

  it('skips and returns null when no invoice matches the payment reference', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue(null);

    const result = await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBeNull();
    expect(mockedInsertOutboxRow).not.toHaveBeenCalled();
  });

  it('proceeds when the invoice payment_method is not BACS', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'CARD',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    const result = await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBe('outbox-1');
  });

  it('proceeds with desnzReference=null when no desnz_ref is found for the application', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue(null);
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    const result = await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), 'record-1');

    expect(result).toBe('outbox-1');
    const [insertParams] = mockedInsertOutboxRow.mock.calls[0];
    expect(insertParams.payload.desnzReference).toBeNull();
  });

  it('builds the expected payload shape and delegates the insert to the repository', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    const payment = buildPayment();
    const result = await applicationOutboxService.recordBacsPaymentEvent(payment, 'record-1');

    expect(result).toBe('outbox-1');
    expect(mockedInsertOutboxRow).toHaveBeenCalledTimes(1);
    const [insertParams, recordId] = mockedInsertOutboxRow.mock.calls[0];
    expect(recordId).toBe('record-1');
    expect(insertParams.applicationId).toBe('app-1');
    expect(insertParams.eventType).toBe('BACS_PAYMENT_EVENT');
    expect(typeof insertParams.idempotencyKey).toBe('string');
    expect(insertParams.payload).toEqual({
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
  });

  it('propagates a repository failure instead of swallowing it', async () => {
    mockedFindApplicationByInvoiceNumber.mockResolvedValue({
      applicationId: 'app-1',
      invoiceNumber: 'INV01/NWL00045',
      paymentMethod: 'BACS',
    });
    mockedFindDesnzReferenceByApplicationId.mockResolvedValue('DESNZ-1');
    mockedInsertOutboxRow.mockRejectedValue(new Error('Failed to insert application_outbox event: connection lost'));

    await expect(
      applicationOutboxService.recordBacsPaymentEvent(buildPayment(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');
  });
});
