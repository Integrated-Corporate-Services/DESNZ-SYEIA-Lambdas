import type { PoolClient } from 'pg';
import type { CreateRequestCommand } from '../domain/request.domain';
import {
  FIND_FURTHER_INFORMATION_REQUEST_BY_EXTERNAL_ID,
  INSERT_FURTHER_INFORMATION_REQUEST,
  LOCK_FURTHER_INFORMATION_REQUEST_BY_EXTERNAL_ID,
} from './queries/request.queries';

export async function createRequest(
  client: PoolClient,
  applicationId: string,
  command: CreateRequestCommand,
): Promise<{ requestId: string; created: boolean }> {
  // Salesforce can resend the same request under a new event id. The lock is held until commit, so a
  // concurrent delivery waits here and then finds the committed row instead of inserting a second one.
  if (command.externalRequestId) {
    await client.query(LOCK_FURTHER_INFORMATION_REQUEST_BY_EXTERNAL_ID, [applicationId, command.externalRequestId]);
    const existing = await client.query<{ further_information_request_id: string }>(
      FIND_FURTHER_INFORMATION_REQUEST_BY_EXTERNAL_ID,
      [applicationId, command.externalRequestId],
    );
    if (existing.rows[0]) return { requestId: existing.rows[0].further_information_request_id, created: false };
  }

  const createdAt = command.createdAt ?? new Date();
  const { rows } = await client.query<{ further_information_request_id: string }>(INSERT_FURTHER_INFORMATION_REQUEST, [
    applicationId,
    command.question,
    command.deadlineAt,
    command.externalRequestId ?? null,
    command.raisedBySource,
    createdAt,
    command.recipientType,
  ]);
  const requestId = rows[0].further_information_request_id;

  return { requestId, created: true };
}