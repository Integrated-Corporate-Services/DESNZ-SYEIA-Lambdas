import type { PoolClient } from 'pg';
import type { ParsedEvent } from '../types';
import {
  INSERT_INTEGRATION_INBOX_EVENT,
  UPDATE_INTEGRATION_INBOX_PROCESSED,
} from './queries/integration-inbox.queries';

export async function registerInboxEvent(client: PoolClient, event: ParsedEvent): Promise<boolean> {
  const { rowCount } = await client.query(INSERT_INTEGRATION_INBOX_EVENT, [
    event.sourceEventId,
    'external-crm',
    event.eventType,
    event.schemaVersion,
    event.applicationId,
    event.applicationType,
    event.correlationId,
    event.caseId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function markInboxProcessed(client: PoolClient, sourceEventId: string): Promise<void> {
  await client.query(UPDATE_INTEGRATION_INBOX_PROCESSED, [sourceEventId]);
}