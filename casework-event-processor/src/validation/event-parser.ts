import { EventError } from '../errors';
import type { ParserConfig } from '../config/parser-config';
import type { FurtherInformationRequestPayload, ParsedFurtherInformationRequestEvent } from '../types';

function fail(message: string, code: string): never {
  throw new EventError(message, code, false);
}

function asRecord(value: unknown, code: string, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(message, code);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, code: string, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(message, code);
  }
  return value;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return fail('requestedDocuments must be an array of strings', 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD');
  }
  return value as string[];
}

function parseJsonRecord(input: string, code: string, message: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return fail(message, code);
  }
  return asRecord(value, code, message);
}

function parseCreatedDate(value: unknown): Date | null {
  const raw = asOptionalString(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return fail('CreatedDate must be a valid ISO date-time', 'INVALID_CREATED_DATE_VALUE');
  }
  return parsed;
}

function parseFurtherInformationRequestPayload(payload: Record<string, unknown>): FurtherInformationRequestPayload {
  return {
    requestId: asString(payload.requestId, 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', 'requestId is required'),
    responseDueDate: asString(
      payload.responseDueDate,
      'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD',
      'responseDueDate is required',
    ),
    message: asString(payload.message, 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', 'message is required'),
    requestedDocuments: asOptionalStringArray(payload.requestedDocuments),
  };
}

export function parseSqsMessage(body: string, config: ParserConfig): ParsedFurtherInformationRequestEvent {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return fail('SQS body is not valid JSON', 'INVALID_SQS_BODY');
  }

  const envelope = asRecord(
    parsedBody,
    'INVALID_EVENTBRIDGE_ENVELOPE',
    'EventBridge envelope must be an object',
  );
  const detailType = asString(envelope['detail-type'], 'INVALID_DETAIL_TYPE', 'detail-type is required');
  if (detailType !== config.detailType) {
    return fail(`Unsupported detail-type: ${detailType}`, 'UNSUPPORTED_DETAIL_TYPE');
  }

  const source = asString(envelope.source, 'INVALID_SOURCE', 'source is required');
  if (!source.startsWith(config.sourcePrefix)) {
    return fail(`Unsupported source: ${source}`, 'UNSUPPORTED_SOURCE');
  }

  const detail = asRecord(envelope.detail, 'INVALID_EVENT_DETAIL', 'detail is required');
  const sourceEventId = asString(envelope.id, 'MISSING_SOURCE_EVENT_ID', 'id is required');
  const detailPayload = asRecord(detail.payload, 'INVALID_DETAIL_PAYLOAD', 'detail.payload is required');
  const eventType = asString(
    detailPayload.Event_Type__c,
    'MISSING_EVENT_TYPE',
    'Event_Type__c is required',
  );
  if (eventType !== 'FURTHER_INFORMATION_REQUEST') {
    return fail(`Unsupported event type: ${eventType}`, 'UNSUPPORTED_EVENT_TYPE');
  }

  const schemaVersion = asString(
    detailPayload.Schema_Version__c,
    'MISSING_SCHEMA_VERSION',
    'Schema_Version__c is required',
  );
  if (schemaVersion !== '1') {
    return fail(`Unsupported schema version: ${schemaVersion}`, 'UNSUPPORTED_SCHEMA_VERSION');
  }

  const applicationId = asString(
    detailPayload.Application_Id__c,
    'MISSING_APPLICATION_ID',
    'Application_Id__c is required',
  );
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return fail('Application_Id__c must be a UUID', 'INVALID_APPLICATION_ID');
  }
  const applicationType = asString(
    detailPayload.Application_Type__c,
    'MISSING_APPLICATION_TYPE',
    'Application_Type__c is required',
  );
  const rawPayload = asString(detailPayload.Payload__c, 'MISSING_PAYLOAD', 'Payload__c is required');
  const payload = parseJsonRecord(rawPayload, 'INVALID_JSON_PAYLOAD', 'Payload__c must contain valid JSON');

  return {
    sourceEventId,
    eventType,
    schemaVersion,
    applicationId,
    applicationType,
    correlationId: asOptionalString(detailPayload.Correlation_Id__c),
    caseId: asOptionalString(detailPayload.Case_Id__c),
    createdById: asOptionalString(detailPayload.CreatedById),
    createdDate: parseCreatedDate(detailPayload.CreatedDate),
    payload: parseFurtherInformationRequestPayload(payload),
  };
}