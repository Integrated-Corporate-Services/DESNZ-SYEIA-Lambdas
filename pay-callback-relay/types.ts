export interface WebhookRow {
  webhook_id: string;
  payment_id: string;
  event_type: string;
  status: string;
  raw_payload: string;
  correlation_id: string | null;
}

export interface SQSEnqueueResult {
  webhookId: string;
  success: boolean;
  error?: string;
}
