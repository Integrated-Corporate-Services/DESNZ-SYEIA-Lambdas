import type { PoolClient } from 'pg';
import {
  FIND_APPLICANT_CONTACT,
  FIND_APPLICATION_STATUS_FOR_UPDATE,
  INSERT_NOTIFICATION,
  INSERT_NOTIFICATION_RECIPIENTS,
  MARK_APPLICATION_FURTHER_INFORMATION_REQUESTED,
} from './queries/notification.queries';

const NOTIFICATION_TYPE = 'FURTHER_INFORMATION_REQUESTED';
const NOTIFICATION_TITLE = 'Further information requested';
const NOTIFICATION_REFERENCE_TYPE = 'further_information_request';

export async function markApplicationFurtherInformationRequested(
  client: PoolClient,
  applicationId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ status: string | null }>(FIND_APPLICATION_STATUS_FOR_UPDATE, [applicationId]);
  await client.query(MARK_APPLICATION_FURTHER_INFORMATION_REQUESTED, [applicationId]);
  return rows[0]?.status ?? null;
}

// Wording matches the backend's furtherInformationRequest.content.ts.
function buildMessage(recipientType: string, desnzRef: string): string {
  return recipientType === 'OBJECTOR'
    ? `A further information request for application ${desnzRef} has been sent to the landowner.`
    : `You have received a further information request for application ${desnzRef}.`;
}

export interface DeliveredNotification {
  notificationId: string;
  type: string;
  referenceType: string;
  recipients: { userId: string; organisationId: string; newValues: Record<string, unknown> }[];
}

// Returns null when there is nobody to notify (no DESNZ ref or no active applicant contact).
export async function notifyFurtherInformationRequest(
  client: PoolClient,
  applicationId: string,
  requestId: string,
  recipientType: string,
): Promise<DeliveredNotification | null> {
  const { rows } = await client.query<{ desnzRef: string | null; userId: string | null; organisationId: string | null }>(
    FIND_APPLICANT_CONTACT,
    [applicationId],
  );
  const desnzRef = rows[0]?.desnzRef?.trim();
  const recipients = rows.filter((row) => row.userId && row.organisationId);
  if (!desnzRef || recipients.length === 0) return null;

  const { rows: created } = await client.query<{ notification_id: string }>(INSERT_NOTIFICATION, [
    NOTIFICATION_TYPE,
    NOTIFICATION_TITLE,
    buildMessage(recipientType, desnzRef),
    NOTIFICATION_REFERENCE_TYPE,
    requestId,
    applicationId,
  ]);
  const notificationId = created[0].notification_id;
  const { rows: added } = await client.query<{
    userId: string;
    organisationId: string;
    newValues: Record<string, unknown>;
  }>(INSERT_NOTIFICATION_RECIPIENTS, [
    notificationId,
    recipients.map((row) => row.userId),
    recipients.map((row) => row.organisationId),
  ]);
  return {
    notificationId,
    type: NOTIFICATION_TYPE,
    referenceType: NOTIFICATION_REFERENCE_TYPE,
    recipients: added ?? [],
  };
}
