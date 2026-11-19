import type { PoolClient } from 'pg';
import { recordAdditionalPaymentEvent } from '../repositories/additional-payment-event.repository';
import type { ParsedAdditionalPaymentReceivedEvent } from '../types';

export async function handleAdditionalPaymentReceived(
  client: PoolClient,
  event: ParsedAdditionalPaymentReceivedEvent,
): Promise<void> {
  await recordAdditionalPaymentEvent(client, event.applicationId, event.sourceEventId, event.payload);
}
