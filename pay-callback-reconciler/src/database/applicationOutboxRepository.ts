import { QueryResult } from 'pg';
import { query } from '../util/database.js';
import { applicationOutboxQueries } from '../queries/applicationOutboxQueries.js';
import type { Payment } from '../types/index.js';

export function isApplicationOutboxEnabled(): boolean {
  return process.env.ENABLE_APPLICATION_OUTBOX === 'true';
}

export function buildPaymentOutboxPayload(params: {
  payment: Payment;
  paymentId: string;
  newStatus: string;
  outboxEventType: string;
  rawEventType: string;
  webhookId: string;
  eventHistory?: string[];
}): string {
  return JSON.stringify({
    applicationId: params.payment.application_id,
    event_type: params.outboxEventType,
    metadata: {
      source: 'SYEIA',
      schemaVersion: 1,
      channel: 'payment-callback-reconciler',
    },
    payment: {
      paymentRecordId: params.payment.id,
      paymentId: params.paymentId,
      status: params.newStatus,
      amount: params.payment.amount,
      reference: params.payment.reference,
      description: params.payment.description,
      govukEventType: params.rawEventType,
      webhookId: params.webhookId,
      eventHistory: params.eventHistory ?? [],
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function createPaymentStatusNotification(params: {
  applicationId: string;
  eventType: string;
  payloadJson: string;
}): Promise<number> {
  const result: QueryResult<{ outbox_id: number }> = await query(
    applicationOutboxQueries.createPaymentStatusNotification,
    [params.applicationId, params.eventType, params.payloadJson]
  );

  if (!result.rows[0]) {
    throw new Error('Failed to create application_outbox record');
  }

  return result.rows[0].outbox_id;
}
