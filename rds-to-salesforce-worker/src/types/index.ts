/**
 * Type definitions for RDS to Salesforce worker
 */

/**
 * SQS message payload structure from RDS trigger/relay
 */
export interface RdsSalesforceMessage {
  eventId: string;
  recordId: string;
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown>;
  timestamp: string;
  correlationId: string | null;
}

/**
 * Fatal message payload structure for DLQ
 */
export interface FatalSqsMessage {
  eventId: string;
  recordId: string;
  tableName: string;
  reason: string;
  originalPayload: Record<string, unknown>;
  timestamp: string;
}

/**
 * Worker result outcome types
 */
export interface WorkerResult {
  eventId: string;
  outcome: 'PROCESSED' | 'SKIPPED_TERMINAL' | 'FATAL' | 'RETRY';
}

/**
 * Salesforce API credentials structure
 */
export interface SalesforceCredentials {
  instanceUrl: string;
  accessToken: string;
  tokenType?: string;
}

/**
 * Salesforce API response structure
 */
export interface SalesforceApiResponse {
  success: boolean;
  id?: string;
  errors?: Array<{
    statusCode: string;
    message: string;
    fields: string[];
  }>;
}

/**
 * Database event row structure
 */
export interface RdsSalesforceEventRow {
  id: string;
  record_id: string;
  table_name: string;
  operation: string;
  data_payload: Record<string, unknown>;
  processing_status: string;
  salesforce_id: string | null;
  failure_reason: string | null;
  correlation_id: string | null;
  created_at: Date;
  updated_at: Date;
  processed_at: Date | null;
}

/**
 * Repository interface for RDS Salesforce events
 */
export interface RdsSalesforceEventRepository {
  findById(id: string): Promise<RdsSalesforceEventRow | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string, salesforceId: string): Promise<void>;
  markRetryableFailure(id: string, reason: string): Promise<void>;
  markFatal(id: string, reason: string): Promise<void>;
}
