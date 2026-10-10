export interface CaseworkEventRow {
  id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  processing_status: string;
  failure_reason: string | null;
  correlation_id: string | null;
}

export const SUPPORTED_EVENT_TYPES = [
  'FURTHER_INFORMATION_REQUEST',
] as const;

export type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

export interface FurtherInformationRequestPayload {
  requestId: string;
  responseDueDate: string;
  message: string;
  requestedDocuments?: string[];
}

export interface ParsedFurtherInformationRequestEvent {
  sourceEventId: string;
  eventType: 'FURTHER_INFORMATION_REQUEST';
  schemaVersion: string;
  applicationId: string;
  applicationType: string;
  correlationId: string | null;
  caseId: string | null;
  createdById: string | null;
  createdDate: Date | null;
  payload: FurtherInformationRequestPayload;
}

export type ParsedEvent = ParsedFurtherInformationRequestEvent;

export interface FatalSqsMessage {
  eventId: string;
  reason: string;
  originalPayload: unknown;
}

export interface WorkerResult {
  eventId: string;
  outcome: 'PROCESSED' | 'SKIPPED_TERMINAL' | 'FATAL' | 'RETRY';
}

export interface CaseworkEventRepository {
  findById(id: string): Promise<CaseworkEventRow | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markRetryableFailure(id: string, reason: string): Promise<void>;
  markFatal(id: string, reason: string): Promise<void>;
}
