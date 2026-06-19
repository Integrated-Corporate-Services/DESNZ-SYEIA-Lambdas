/**
 * SQS and Webhook Types
 */

import { SQSRecord, SQSBatchResponse, SQSBatchItemFailure, Context } from 'aws-lambda';

export type { SQSRecord, SQSBatchResponse, SQSBatchItemFailure, Context };

export interface WebhookMetadata {
  webhookId: string;
  paymentId: string;
  eventType: string;
  signature?: string;
  source: string;
  requestId?: string;
  correlationId?: string;
  timestamp?: string;
}

/** GOV.UK Pay webhook body (as stored in payment_webhooks.raw_payload). */
export interface GovUKPayWebhook {
  webhook_message_id?: string;
  api_version?: number;
  created_date?: string;
  resource_id?: string;
  resource_type?: string;
  event_type: string;
  resource?: GovUKPayResource;
  /** Legacy / alternate shapes */
  type?: string;
  timestamp?: string;
  event_id?: string;
  data?: unknown;
}

export interface GovUKPayResource {
  payment_id: string;
  amount?: number;
  reference?: string;
  description?: string;
  state?: {
    status: string;
    finished: boolean;
    message?: string;
    code?: string;
  };
  email?: string;
  card_brand?: string;
  trans_id?: string;
  refund_summary?: {
    status: string;
    amount_available: number;
    amount_submitted: number;
  };
  settlement_summary?: {
    capture_submit_time: string;
    captured_date: string;
  };
  payment_provider?: string;
  created_date?: string;
}

export interface SQSMessageBody {
  webhook: GovUKPayWebhook;
  metadata: WebhookMetadata;
}

export interface ProcessResult {
  action: 'PROCESS' | 'PROCESSED' | 'DUPLICATE' | 'OUT_OF_ORDER' | 'INVALID' | 'IGNORE';
  reason?: string;
  eventId?: string;
  payment?: unknown;
  statusChanged?: boolean;
  eventType?: string;
  finalStatus?: string;
  allEvents?: string[];
  processed?: boolean;
  currentStatus?: string;
}
