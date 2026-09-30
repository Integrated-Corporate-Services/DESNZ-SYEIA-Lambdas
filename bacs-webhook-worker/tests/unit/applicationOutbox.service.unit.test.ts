jest.mock('../../src/repositories/payment.repository', () => ({
  paymentRepository: {
    findApplicationDetailsByApplicationId: jest.fn(),
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
import type { InvoiceApplicationLookup, ApplicationDetailsLookup } from '../../src/repositories/payment.repository';

const mockedFindApplicationDetailsByApplicationId = paymentRepository.findApplicationDetailsByApplicationId as jest.Mock;
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

function buildInvoiceLookup(overrides: Partial<InvoiceApplicationLookup> = {}): InvoiceApplicationLookup {
  return {
    applicationId: 'app-1',
    invoiceNumber: 'INV01/NWL00045',
    paymentMethod: 'BACS',
    amountPence: 100,
    ...overrides,
  };
}

function buildApplicationDetails(overrides: Partial<ApplicationDetailsLookup> = {}): ApplicationDetailsLookup {
  return {
    desnzReference: 'NWL00045',
    formType: 'NWL',
    ...overrides,
  };
}

describe('applicationOutboxService.recordBacsPaymentEvent', () => {
  beforeEach(() => {
    mockedFindApplicationDetailsByApplicationId.mockReset();
    mockedInsertOutboxRow.mockReset();
  });

  it('skips and returns null when the payment has no paymentId', async () => {
    const result = await applicationOutboxService.recordBacsPaymentEvent(
      buildPayment({ paymentId: '' }),
      buildInvoiceLookup(),
      'record-1',
    );

    expect(result).toBeNull();
    expect(mockedInsertOutboxRow).not.toHaveBeenCalled();
  });

  it('proceeds when the invoice payment_method is not BACS', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(buildApplicationDetails());
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    const result = await applicationOutboxService.recordBacsPaymentEvent(
      buildPayment(),
      buildInvoiceLookup({ paymentMethod: 'CARD' }),
      'record-1',
    );

    expect(result).toBe('outbox-1');
  });

  it('skips and returns null when no desnz_ref is found for the application', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(buildApplicationDetails({ desnzReference: null, formType: null }));

    const result = await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), buildInvoiceLookup(), 'record-1');

    expect(result).toBeNull();
    expect(mockedInsertOutboxRow).not.toHaveBeenCalled();
  });

  it('builds the expected payload shape and delegates the insert to the repository', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(buildApplicationDetails());
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    const payment = buildPayment();
    const result = await applicationOutboxService.recordBacsPaymentEvent(payment, buildInvoiceLookup(), 'record-1');

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
      formType: 'NWL',
      desnzReference: 'NWL00045',
      invoiceNumber: 'INV01/NWL00045',
      payment: {
        amount: payment.amount,
        currency: payment.currency,
        status: 'PAID',
        bacsReference: payment.bacsReference,
        paymentReference: 'INV01/NWL00045',
        paymentDate: payment.paymentDate,
        receivedAt: payment.receivedAt,
      },
    });
  });

  it('passes through the S37 form type from the application table', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(
      buildApplicationDetails({ desnzReference: 'S3700046', formType: 'S37' }),
    );
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), buildInvoiceLookup(), 'record-1');

    const [insertParams] = mockedInsertOutboxRow.mock.calls[0];
    expect(insertParams.payload.formType).toBe('S37');
  });

  it('passes formType through as null when the application table has no type recorded', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(
      buildApplicationDetails({ desnzReference: 'NWL00045', formType: null }),
    );
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    await applicationOutboxService.recordBacsPaymentEvent(buildPayment(), buildInvoiceLookup(), 'record-1');

    const [insertParams] = mockedInsertOutboxRow.mock.calls[0];
    expect(insertParams.payload.formType).toBeNull();
  });

  it('passes an arbitrary recognised status through verbatim in the outbox payload', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(buildApplicationDetails());
    mockedInsertOutboxRow.mockResolvedValue('outbox-1');

    await applicationOutboxService.recordBacsPaymentEvent(
      buildPayment({ status: 'FAILED' }),
      buildInvoiceLookup(),
      'record-1',
    );

    const [insertParams] = mockedInsertOutboxRow.mock.calls[0];
    expect(insertParams.payload.payment.status).toBe('FAILED');
  });

  it('skips outbox insert when the status cannot be mapped', async () => {
    const result = await applicationOutboxService.recordBacsPaymentEvent(
      buildPayment({ status: 'PENDING' }),
      buildInvoiceLookup(),
      'record-1',
    );

    expect(result).toBeNull();
    expect(mockedInsertOutboxRow).not.toHaveBeenCalled();
  });

  it('propagates a repository failure instead of swallowing it', async () => {
    mockedFindApplicationDetailsByApplicationId.mockResolvedValue(buildApplicationDetails());
    mockedInsertOutboxRow.mockRejectedValue(new Error('Failed to insert application_outbox event: connection lost'));

    await expect(
      applicationOutboxService.recordBacsPaymentEvent(buildPayment(), buildInvoiceLookup(), 'record-1'),
    ).rejects.toThrow('Failed to insert application_outbox event: connection lost');
  });
});
