import type { PoolClient } from 'pg';
import { EventError } from '../errors';
import { handleFurtherInformationRequest } from '../handlers/further-information-request.handler';
import type { ParsedEvent } from '../types';

export async function routeEvent(client: PoolClient, event: ParsedEvent): Promise<void> {
  switch (event.eventType) {
    case 'FURTHER_INFORMATION_REQUEST':
      await handleFurtherInformationRequest(client, event);
      return;
    default: {
      throw new EventError('Unsupported routed event type', 'UNSUPPORTED_EVENT_TYPE', false);
    }
  }
}