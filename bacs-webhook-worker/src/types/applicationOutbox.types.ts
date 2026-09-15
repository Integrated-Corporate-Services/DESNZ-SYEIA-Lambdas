export interface BacsPaymentOutboxPaymentDetails {
  amount: number;
  currency: string;
  status: string;
  bacsReference: string | null;
  paymentReference: string;
  paymentDate: string | null;
  receivedAt: string;
}

export interface BacsPaymentOutboxPayload {
  applicationId: string;
  event_type: string;
  desnzReference: string | null;
  invoiceNumber: string;
  payment: BacsPaymentOutboxPaymentDetails;
}

export interface InsertBacsPaymentOutboxParams {
  applicationId: string;
  eventType: string;
  payload: BacsPaymentOutboxPayload;
  idempotencyKey: string;
}
