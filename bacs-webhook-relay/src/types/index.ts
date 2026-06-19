import type { RelayOutcome } from '../constants/status.constants';

export interface PaymentWebhookRow {
  id: number;
  webhook_id: string;
  payment_id: string;
  event_type: string;
  status: string;
  raw_payload: string | Record<string, unknown>;
  enqueued_at: Date | string | null;
  created_by: string | null;
  updated_by: string | null;
  correlation_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

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

export interface BacsWebhookRelayConfig {
  batchSize: number;
}

export interface RelayResultItem {
  webhookId: string;
  outcome: RelayOutcome;
  sqsMessageId?: string;
  reason?: string;
}

export interface RelaySummary {
  totalSelected: number;
  enqueued: number;
  poisoned: number;
  failed: number;
  items: RelayResultItem[];
}

export interface RdsCredentials {
  username: string;
  password: string;
  rotationVersionId?: string;
  fetchedAt: number;
}
