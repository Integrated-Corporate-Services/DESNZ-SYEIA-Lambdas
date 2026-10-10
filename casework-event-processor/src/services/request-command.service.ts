import type { PoolClient } from 'pg';
import type { CreateRequestCommand } from '../domain/request.domain';
import { createRequest } from '../repositories/request.repository';

export async function createRequestInTransaction(
  client: PoolClient,
  applicationId: string,
  command: CreateRequestCommand,
): Promise<{ requestId: string }> {
  return createRequest(client, applicationId, command);
}