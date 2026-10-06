export interface BacsPaymentOutboxPaymentDetails {
  amount: number;
  currency: string;
  status: string;
  bacsReference: string | null;
  paymentReference: string;
  paymentDate: string | null;
  receivedAt: string;
}

export interface BacsPaymentOutboxVariance {
  expectedAmount: string | null;
  receivedAmount: string;
  differenceAmount: string | null;
  varianceType: 'OVERPAID' | 'UNDERPAID' | 'MATCHED' | null;
}

export interface BacsPaymentOutboxPayload {
  applicationId: string;
  event_type: string;
  formType: string | null;
  desnzReference: string | null;
  invoiceNumber: string;
  payment: BacsPaymentOutboxPaymentDetails;
  paymentVariance: BacsPaymentOutboxVariance;
}

export interface InsertBacsPaymentOutboxParams {
  applicationId: string;
  eventType: string;
  payload: BacsPaymentOutboxPayload;
  idempotencyKey: string;
}
