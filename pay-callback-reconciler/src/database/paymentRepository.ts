import { QueryResult } from 'pg';
import { query } from '../util/database.js';
import { paymentQueries, ALLOWED_UPDATE_FIELDS } from '../queries/index.js';
import type { Payment, CreatePaymentData, UpdatePaymentData, PaymentEvent } from '../types/index.js';

export async function findByGovukPayId(govukPayId: string): Promise<Payment | null> {
  const result: QueryResult<Payment> = await query(
    paymentQueries.findByGovukPayId,
    [govukPayId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new payment record
 */
export async function createPayment(
  govukPayId: string, 
  initialData: CreatePaymentData = {}
): Promise<Payment> {
  const {
    reference = null,
    amount = null,
    status = 'pending',
    description = null
  } = initialData;

  const result: QueryResult<Payment> = await query(
    paymentQueries.createPayment,
    [govukPayId, reference, amount, status, description]
  );

  if (!result.rows[0]) {
    throw new Error('Failed to create payment');
  }
  return result.rows[0];
}

/**
 * Get all payment events (for state derivation)
 * Orders by event_timestamp from webhook, then received_at as fallback
 */
export async function getPaymentEvents(govukPayId: string): Promise<PaymentEvent[]> {
  const result: QueryResult<PaymentEvent> = await query(
    paymentQueries.getPaymentEvents,
    [govukPayId]
  );
  return result.rows || [];
}

/**
 * Update payment with out-of-order handling (SQL injection safe)
 */
export async function updatePaymentWithOrdering(
  govukPayId: string, 
  updates: UpdatePaymentData
): Promise<Payment> {
  // Filter to only allowed fields
  const validUpdates: Record<string, any> = {};
  Object.keys(updates).forEach(key => {
    if (ALLOWED_UPDATE_FIELDS.includes(key as any)) {
      // Stringify JSONB fields
      if (key === 'event_history' && updates[key as keyof UpdatePaymentData] !== null && updates[key as keyof UpdatePaymentData] !== undefined) {
        validUpdates[key] = JSON.stringify(updates[key as keyof UpdatePaymentData]);
      } else {
        validUpdates[key] = updates[key as keyof UpdatePaymentData];
      }
    }
  });

  if (Object.keys(validUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const setClauses = Object.keys(validUpdates)
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');

  const values = [...Object.values(validUpdates), govukPayId];

  const queryText = `UPDATE payments SET ${setClauses}, updated_at = NOW() WHERE govuk_pay_id = $${Object.keys(validUpdates).length + 1} RETURNING *`;

  const result: QueryResult<Payment> = await query(
    queryText,
    values
  );

  if (!result.rows[0]) {
    throw new Error('Payment not found for update');
  }
  return result.rows[0];
}

/**
 * Record payment event with timestamp from webhook
 */
export async function recordPaymentEvent(data: {
  event_id: string;
  govuk_pay_id: string;
  event_type: string;
  event_data: any;
  event_timestamp: string | Date;
}): Promise<PaymentEvent> {
  const result: QueryResult<PaymentEvent> = await query(
    paymentQueries.recordPaymentEvent,
    [data.event_id, data.govuk_pay_id, data.event_type, 
     JSON.stringify(data.event_data), data.event_timestamp]
  );

  if (!result.rows[0]) {
    throw new Error('Failed to record payment event');
  }
  return result.rows[0];
}
