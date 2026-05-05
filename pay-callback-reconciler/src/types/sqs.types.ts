/**
 * SQS and Webhook Types
 * Type definitions for SQS events and GOV.UK Pay webhooks
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

export interface GovUKPayWebhook {
  type: string;
  timestamp: string;
  event_id: string;
  event_type: string;  // GOV.UK Pay event type like 'card_payment_succeeded'
  resource_type: string;
  resource: GovUKPayResource;
  data?: any;  // Additional data from webhook
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
  payment?: any;
  statusChanged?: boolean;
  eventType?: string;
  finalStatus?: string;
  allEvents?: string[];
  processed?: boolean;
  currentStatus?: string;
}

export interface LambdaContext {
  requestId: string;
  awsRequestId: string;
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  logGroupName: string;
  logStreamName: string;
  getRemainingTimeInMillis: () => number;
}
