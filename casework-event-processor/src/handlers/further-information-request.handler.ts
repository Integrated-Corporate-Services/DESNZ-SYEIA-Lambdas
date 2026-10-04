import type { PoolClient } from 'pg';
import { createRequestInTransaction } from '../services/request-command.service';
import type { ParsedFurtherInformationRequestEvent } from '../types';

export async function handleFurtherInformationRequest(
  client: PoolClient,
  event: ParsedFurtherInformationRequestEvent,
): Promise<void> {
  await createRequestInTransaction(client, event.applicationId, {
    question: event.payload.message,
    deadlineAt: event.payload.responseDueDate,
    requestedDocuments: event.payload.requestedDocuments,
    raisedBySource: 'external-event-relay',
    createdAt: event.createdDate ?? undefined,
    externalRequestId: event.payload.requestId,
  });
}