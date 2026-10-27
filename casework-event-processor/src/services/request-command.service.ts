import type { PoolClient } from 'pg';
import type { CreateRequestCommand } from '../domain/request.domain';
import { createRequest } from '../repositories/request.repository';
import {
  markApplicationFurtherInformationRequested,
  notifyFurtherInformationRequest,
} from '../repositories/notification.repository';
import { insertAuditEvent } from '../repositories/audit.repository';

const FIR_STATUS = 'FURTHER_INFORMATION_REQUESTED';

export async function createRequestInTransaction(
  client: PoolClient,
  applicationId: string,
  command: CreateRequestCommand,
): Promise<{ requestId: string }> {
  const created = await createRequest(client, applicationId, command);
  if (!created.created) return { requestId: created.requestId };
  const { requestId } = created;
  const correlationId = command.audit?.correlationId ?? null;

  // Audit writes are not best-effort: a failure rolls the event back so it is retried, as in the backend.
  await insertAuditEvent(client, {
    eventCategory: 'data_access',
    eventType: 'data.created',
    action: 'create',
    resourceType: 'further_information_request',
    resourceId: requestId,
    parentResourceType: 'application',
    parentResourceId: applicationId,
    correlationId,
    metadata: {
      recipientType: command.recipientType,
      externalRequestId: command.externalRequestId ?? null,
      sourceEventId: command.audit?.sourceEventId,
      caseId: command.audit?.caseId ?? null,
      applicationType: command.audit?.applicationType,
      raisedBySource: command.raisedBySource,
    },
  });

  const previousStatus = await markApplicationFurtherInformationRequested(client, applicationId);
  if (previousStatus !== FIR_STATUS) {
    await insertAuditEvent(client, {
      eventCategory: 'application',
      eventType: 'status_changed',
      action: 'update',
      resourceType: 'application',
      resourceId: applicationId,
      correlationId,
      previousValues: { status: previousStatus },
      newValues: { status: FIR_STATUS },
      changeSummary: { fields_updated: ['status'] },
      metadata: { furtherInformationRequestId: requestId, sourceEventId: command.audit?.sourceEventId },
    });
  }

  // A notification failure also rolls back the FIR and inbox row, so the event is retried rather than committed undelivered.
  const delivered = await notifyFurtherInformationRequest(client, applicationId, requestId, command.recipientType);
  for (const recipient of delivered?.recipients ?? []) {
    await insertAuditEvent(client, {
      eventCategory: 'notification',
      eventType: 'notification_sent',
      action: 'create',
      resourceType: 'notification',
      resourceId: delivered!.notificationId,
      parentResourceType: 'application',
      parentResourceId: applicationId,
      subjectId: recipient.userId,
      correlationId,
      newValues: recipient.newValues,
      metadata: {
        channel: 'in_app',
        notification_type: delivered!.type,
        reference_type: delivered!.referenceType,
        reference_id: requestId,
        organisation_id: recipient.organisationId,
      },
    });
  }

  return { requestId };
}