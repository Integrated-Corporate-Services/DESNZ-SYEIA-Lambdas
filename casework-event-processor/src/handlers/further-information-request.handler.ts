import type { PoolClient } from 'pg';
import { createRequestInTransaction } from '../services/request-command.service';
import type { ParsedFurtherInformationRequestEvent } from '../types';

export async function handleFurtherInformationRequest(
  client: PoolClient,
  event: ParsedFurtherInformationRequestEvent,
): Promise<void> {
  await createRequestInTransaction(client, event.applicationId, {
    question: event.payload.message,
    recipientType: event.payload.recipientType,
    deadlineAt: event.payload.responseDueDate,
    raisedBySource: 'external-event-relay',
    createdAt: event.createdDate ?? undefined,
    externalRequestId: event.payload.requestId,
    audit: {
      sourceEventId: event.sourceEventId,
      correlationId: event.correlationId,
      caseId: event.caseId,
      applicationType: event.applicationType,
    },
  });
}