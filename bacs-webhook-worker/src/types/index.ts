
export interface WorkerSummary {
  processed: number;
  failed: number;
  errors: WorkerError[];
}

export interface WorkerError {
  message: string;
  recordId: string;
  code?: string;
}

// Relay envelope format (what we receive from SQS)
export interface BacsWebhookRelayEnvelope {
  schemaVersion: '1';
  source: 'BACS';
  webhookId: string;
  paymentId: string;
  eventType: string;
  status: string;
  correlationId: string | null;
  receivedAt: string;
  payload: Record<string, unknown>;
}

// UKSBS webhook structure (nested in envelope.payload)
export interface UkSbsWebhookPayload {
  event: {
    eventId: string;
    eventType: string;
    eventVersion: string;
    occurredAt: string;
    source: string;
  };
  callback: {
    deliveryId: string;
    attemptNumber: number;
  };
  payment: {
    paymentReference: string;
  };
  detail: {
    status: string;
    amount: number;
    currency: string;
    paymentDate: string;
    bacsReference?: string;
  };
}

// Internal normalized format for processing
export interface ProcessablePayment {
  webhookId: string;
  paymentId: string;
  transactionId: string;  // From payment.paymentReference
  amount: number;         // From detail.amount
  status: string;         // From detail.status
  currency: string;       // From detail.currency
  bacsReference?: string; // From detail.bacsReference
  eventType: string;      // From envelope
  correlationId: string | null;
  receivedAt: string;
}

// Legacy test format (deprecated)
export interface PaymentPayload {
  transactionId: string;
  amount: number;
  status: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ProcessResult {
  recordId: string;
  success: boolean;
  message?: string;
  error?: WorkerError;
}
