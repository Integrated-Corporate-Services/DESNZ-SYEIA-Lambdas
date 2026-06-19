import { QueryResult } from 'pg';
import { query } from '../util/database.js';
import { paymentQueries, ALLOWED_UPDATE_FIELDS } from '../queries/index.js';
import type { Payment, UpdatePaymentData, PaymentEvent } from '../types/index.js';

export async function findByPaymentId(paymentId: string): Promise<Payment | null> {
  const result: QueryResult<Payment> = await query(
    paymentQueries.findByPaymentId,
    [paymentId]
  );
  return result.rows[0] || null;
}

/** @deprecated Use findByPaymentId */
export const findByGovukPayId = findByPaymentId;

export async function getPaymentEvents(paymentId: string): Promise<PaymentEvent[]> {
  const result: QueryResult<PaymentEvent> = await query(
    paymentQueries.getPaymentEvents,
    [paymentId]
  );
  return result.rows || [];
}

export async function updatePaymentWithOrdering(
  paymentId: string,
  updates: UpdatePaymentData
): Promise<Payment> {
  const validUpdates: Record<string, unknown> = {};
  Object.keys(updates).forEach((key) => {
    if (ALLOWED_UPDATE_FIELDS.includes(key as (typeof ALLOWED_UPDATE_FIELDS)[number])) {
      validUpdates[key] = updates[key as keyof UpdatePaymentData];
    }
  });

  if (Object.keys(validUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClauses = Object.keys(validUpdates)
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const values = [...Object.values(validUpdates), paymentId];

  const queryText = `UPDATE payment SET ${setClauses}, updated_at = NOW() WHERE payment_id = $${Object.keys(validUpdates).length + 1} RETURNING *`;

  const result: QueryResult<Payment> = await query(queryText, values);

  if (!result.rows[0]) {
    throw new Error('Payment not found for update');
  }
  return result.rows[0];
}

export async function recordPaymentEvent(data: {
  event_id: string;
  payment_id: string;
  event_type: string;
  event_data: unknown;
  event_timestamp: string | Date;
}): Promise<PaymentEvent> {
  const result: QueryResult<PaymentEvent> = await query(
    paymentQueries.recordPaymentEvent,
    [
      data.event_id,
      data.payment_id,
      data.event_type,
      JSON.stringify(data.event_data),
      data.event_timestamp,
    ]
  );

  if (!result.rows[0]) {
    throw new Error('Failed to record payment event');
  }
  return result.rows[0];
}
