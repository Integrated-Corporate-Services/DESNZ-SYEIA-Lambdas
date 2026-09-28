/**
 * Type Definitions for Casework Event Processor Lambda
 */

/**
 * Database row structure from casework_event table
 */
export interface CaseworkEventRow {
  id: string;
  event_type: string;
  payload_json: Record<string, unknown>;
  processing_status: string;
  failure_reason: string | null;
  correlation_id: string | null;
}

/**
 * SQS message payload structure (from relay Lambda)
 */
export interface CaseworkSqsMessage {
  eventId: string;
  eventType: string;
  correlationId: string | null;
}

/**
 * Fatal message payload structure
 */
export interface FatalSqsMessage {
  eventId: string;
  reason: string;
  originalPayload: unknown;
}

/**
 * Worker processing result
 */
export interface WorkerResult {
  eventId: string;
  outcome: 'PROCESSED' | 'SKIPPED_TERMINAL' | 'FATAL' | 'RETRY';
}

/**
 * Casework Event Repository Interface
 */
export interface CaseworkEventRepository {
  findById(id: string): Promise<CaseworkEventRow | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markRetryableFailure(id: string, reason: string): Promise<void>;
  markFatal(id: string, reason: string): Promise<void>;
}
