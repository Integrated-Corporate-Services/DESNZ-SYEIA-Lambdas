import { EventError } from '../errors';
import type { ParserConfig } from '../config/parser-config';
import type { FurtherInformationRequestPayload, ParsedFurtherInformationRequestEvent } from '../types';

const FIR_EVENT_DETAIL_TYPE = 'Further_Information_Request_Event__e';

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

// S37 sends typeOfInformation; NWL sends recipientType. Defaults to APPLICANT only when neither is sent (absent/null).
function parseRecipientType(payload: Record<string, unknown>): string {
  const selected = payload.recipientType ?? payload.typeOfInformation;
  if (selected === undefined || selected === null) return 'APPLICANT';
  if (typeof selected !== 'string' || selected.trim() === '') {
    return fail('recipientType must be a non-empty string', 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD');
  }
  const recipientType = selected.trim().toUpperCase();
  // Same values the backend and further_information_request_recipient_type_check accept.
  if (recipientType !== 'APPLICANT' && recipientType !== 'OBJECTOR') {
    return fail('recipientType must be APPLICANT or OBJECTOR', 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD');
  }
  return recipientType;
}

function parseResponseDueDate(value: unknown): string {
  const date = asString(value, 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', 'responseDueDate is required');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return fail('responseDueDate must be a valid YYYY-MM-DD date', 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD');
  }
  return date;
}

function parseMessage(value: unknown): string {
  const message = asString(value, 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', 'message is required');
  if (message.length > 5000) {
    return fail('message must be 5000 characters or fewer', 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD');
  }
  return message;
}

function parseFurtherInformationRequestPayload(payload: Record<string, unknown>): FurtherInformationRequestPayload {
  return {
    requestId: asString(payload.requestId, 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', 'requestId is required'),
    recipientType: parseRecipientType(payload),
    responseDueDate: parseResponseDueDate(payload.responseDueDate),
    message: parseMessage(payload.message),
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
  const allowedDetailTypes = config.detailType.split(',').map((value) => value.trim());
  if (!allowedDetailTypes.includes(detailType)) {
    return fail(`Unsupported detail-type: ${detailType}`, 'UNSUPPORTED_DETAIL_TYPE');
  }

  const source = asString(envelope.source, 'INVALID_SOURCE', 'source is required');
  if (!source.startsWith(config.sourcePrefix)) {
    return fail(`Unsupported source: ${source}`, 'UNSUPPORTED_SOURCE');
  }

  const detail = asRecord(envelope.detail, 'INVALID_EVENT_DETAIL', 'detail is required');
  const sourceEventId = asString(envelope.id, 'MISSING_SOURCE_EVENT_ID', 'id is required');
  const detailPayload = asRecord(detail.payload, 'INVALID_DETAIL_PAYLOAD', 'detail.payload is required');
  // Further_Information_Request_Event__e carries no Event_Type__c or Schema_Version__c; its detail-type says what it is.
  const isFirEvent = detailType === FIR_EVENT_DETAIL_TYPE;
  const eventType = asString(
    detailPayload.Event_Type__c ?? (isFirEvent ? 'FURTHER_INFORMATION_REQUEST' : undefined),
    'MISSING_EVENT_TYPE',
    'Event_Type__c is required',
  );
  if (eventType !== 'FURTHER_INFORMATION_REQUEST') {
    return fail(`Unsupported event type: ${eventType}`, 'UNSUPPORTED_EVENT_TYPE');
  }

  const schemaVersion = asString(
    detailPayload.Schema_Version__c ?? (isFirEvent ? '1' : undefined),
    'MISSING_SCHEMA_VERSION',
    'Schema_Version__c is required',
  );
  if (schemaVersion !== '1') {
    return fail(`Unsupported schema version: ${schemaVersion}`, 'UNSUPPORTED_SCHEMA_VERSION');
  }

  const applicationId = asString(
    detailPayload.Application_Id__c ?? detailPayload.AWS_Application_Id__c,
    'MISSING_APPLICATION_ID',
    'Application_Id__c or AWS_Application_Id__c is required',
  );
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    return fail('Application_Id__c must be a UUID', 'INVALID_APPLICATION_ID');
  }
  const applicationType = asString(
    detailPayload.Application_Type__c ?? detailPayload.Type_of_Application__c,
    'MISSING_APPLICATION_TYPE',
    'Application_Type__c or Type_of_Application__c is required',
  );
  const rawPayload = asString(detailPayload.Payload__c, 'MISSING_PAYLOAD', 'Payload__c is required');
  const payload = parseJsonRecord(rawPayload, 'INVALID_JSON_PAYLOAD', 'Payload__c must contain valid JSON');

  return {
    sourceEventId,
    eventType,
    schemaVersion,
    applicationId,
    applicationType,
    correlationId: asOptionalString(detailPayload.Correlation_Id__c) ?? asOptionalString(detail.id),
    caseId: asOptionalString(detailPayload.Case_Id__c ?? detailPayload.Case__c),
    createdById: asOptionalString(detailPayload.CreatedById),
    createdDate: parseCreatedDate(detailPayload.CreatedDate),
    payload: parseFurtherInformationRequestPayload(payload),
  };
}