export interface AdditionalPaymentEventRow {
  id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  processing_status: string;
  failure_reason: string | null;
  correlation_id: string | null;
}

export const SUPPORTED_EVENT_TYPES = [
  'ADDITIONAL_PAYMENT_RECEIVED',
] as const;

export type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

export interface AdditionalPaymentReceivedPayload {
  paymentId: string;
  paymentReference: string;
  amount: number;
  description: string;
}

export interface ParsedAdditionalPaymentReceivedEvent {
  sourceEventId: string;
  eventType: 'ADDITIONAL_PAYMENT_RECEIVED';
  schemaVersion: string;
  applicationId: string;
  applicationType: string;
  correlationId: string | null;
  caseId: string | null;
  createdById: string | null;
  createdDate: Date | null;
  payload: AdditionalPaymentReceivedPayload;
}

export type ParsedEvent = ParsedAdditionalPaymentReceivedEvent;

export interface FatalSqsMessage {
  eventId: string;
  reason: string;
  originalPayload: unknown;
}

export interface WorkerResult {
  eventId: string;
  outcome: 'PROCESSED' | 'SKIPPED_TERMINAL' | 'FATAL' | 'RETRY';
}

export interface AdditionalPaymentEventRepository {
  findById(id: string): Promise<AdditionalPaymentEventRow | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markRetryableFailure(id: string, reason: string): Promise<void>;
  markFatal(id: string, reason: string): Promise<void>;
}
