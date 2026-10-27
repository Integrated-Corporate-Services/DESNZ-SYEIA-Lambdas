import type { PoolClient } from 'pg';
import { INSERT_AUDIT_EVENT } from './queries/audit.queries';

const SOURCE_SERVICE = 'casework-event-processor-lambda';
const ACTOR_ID = 'casework-event-processor';

export interface AuditEventInput {
  eventCategory: 'data_access' | 'application' | 'notification';
  eventType: 'data.created' | 'status_changed' | 'notification_sent';
  action: 'create' | 'update';
  resourceType: string;
  resourceId: string;
  parentResourceType?: string;
  parentResourceId?: string;
  subjectId?: string;
  correlationId?: string | null;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changeSummary?: Record<string, unknown>;
  // Ids, types and counts only: never request text or names.
  metadata?: Record<string, unknown>;
}

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

// Written through the event's transaction client so an audit failure rolls the whole event back for retry.
export async function insertAuditEvent(client: PoolClient, event: AuditEventInput): Promise<void> {
  await client.query(INSERT_AUDIT_EVENT, [
    event.eventCategory,
    event.eventType,
    ACTOR_ID,
    'system',
    event.subjectId ?? null,
    event.resourceType,
    event.resourceId,
    event.parentResourceType ?? null,
    event.parentResourceId ?? null,
    event.action,
    'success',
    event.correlationId ?? null,
    SOURCE_SERVICE,
    json(event.previousValues),
    json(event.newValues),
    json(event.changeSummary),
    json(event.metadata),
    event.eventCategory === 'data_access',
    event.eventCategory === 'data_access' ? 'legal_obligation' : null,
  ]);
}
