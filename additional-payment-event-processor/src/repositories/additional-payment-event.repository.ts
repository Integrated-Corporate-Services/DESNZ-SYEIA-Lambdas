import type { PoolClient } from 'pg';
import type { AdditionalPaymentReceivedPayload } from '../types';
import {
  FIND_ADDITIONAL_PAYMENT_EVENT_BY_SOURCE_EVENT_ID,
  INSERT_ADDITIONAL_PAYMENT_EVENT,
} from './queries/additional-payment-event.queries';

// Demo table standing in for whatever real payment ledger/application tables this
// event will eventually need to update - replace once that design is confirmed.
export async function recordAdditionalPaymentEvent(
  client: PoolClient,
  applicationId: string,
  sourceEventId: string,
  payload: AdditionalPaymentReceivedPayload,
): Promise<{ additionalPaymentEventId: string }> {
  const { rows } = await client.query<{ additional_payment_event_id: string }>(INSERT_ADDITIONAL_PAYMENT_EVENT, [
    applicationId,
    payload.paymentId,
    payload.paymentReference,
    payload.amount,
    payload.description,
    sourceEventId,
    new Date(),
  ]);

  if (rows[0]) {
    return { additionalPaymentEventId: rows[0].additional_payment_event_id };
  }

  // ON CONFLICT DO NOTHING means this source event was already recorded; look it up instead of re-inserting.
  const existing = await client.query<{ additional_payment_event_id: string }>(
    FIND_ADDITIONAL_PAYMENT_EVENT_BY_SOURCE_EVENT_ID,
    [sourceEventId],
  );
  return { additionalPaymentEventId: existing.rows[0].additional_payment_event_id };
}
