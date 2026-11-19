import type { PoolClient } from 'pg';
import { EventError } from '../errors';
import { handleAdditionalPaymentReceived } from '../handlers/additional-payment-received.handler';
import type { ParsedEvent } from '../types';

export async function routeEvent(client: PoolClient, event: ParsedEvent): Promise<void> {
  switch (event.eventType) {
    case 'ADDITIONAL_PAYMENT_RECEIVED':
      await handleAdditionalPaymentReceived(client, event);
      return;
    default: {
      throw new EventError('Unsupported routed event type', 'UNSUPPORTED_EVENT_TYPE', false);
    }
  }
}
