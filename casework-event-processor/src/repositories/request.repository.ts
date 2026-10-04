import type { PoolClient } from 'pg';
import type { CreateRequestCommand } from '../domain/request.domain';
import {
  INSERT_FURTHER_INFORMATION_REQUEST,
  INSERT_FURTHER_INFORMATION_REQUEST_CATEGORY,
} from './queries/request.queries';

export async function createRequest(
  client: PoolClient,
  applicationId: string,
  command: CreateRequestCommand,
): Promise<{ requestId: string }> {
  const createdAt = command.createdAt ?? new Date();
  const { rows } = await client.query<{ further_information_request_id: string }>(INSERT_FURTHER_INFORMATION_REQUEST, [
    applicationId,
    command.question,
    command.deadlineAt,
    command.externalRequestId ?? null,
    command.raisedBySource,
    createdAt,
  ]);
  const requestId = rows[0].further_information_request_id;

  for (const [index, documentCategory] of (command.requestedDocuments ?? []).entries()) {
    await client.query(INSERT_FURTHER_INFORMATION_REQUEST_CATEGORY, [requestId, documentCategory, index + 1]);
  }

  return { requestId };
}