import { EventError } from '../../src/errors';
import { parseSqsMessage } from '../../src/validation/event-parser';

const parserConfig = {
  detailType: 'Casework_Event__e',
  sourcePrefix: 'aws.partner/salesforce.com/',
};

function bodyWith(payload: Record<string, unknown> = {}) {
  return JSON.stringify({
    source: 'aws.partner/salesforce.com/example',
    'detail-type': parserConfig.detailType,
    id: 'sf-event-1',
    detail: {
      payload: {
        Event_Type__c: 'FURTHER_INFORMATION_REQUEST',
        Schema_Version__c: '1',
        Application_Id__c: '550e8400-e29b-41d4-a716-446655440000',
        Application_Type__c: 'S37',
        Correlation_Id__c: 'CORR-123',
        Case_Id__c: '500001',
        CreatedById: '005001',
        CreatedDate: '2026-09-27T10:00:00.000Z',
        Payload__c: JSON.stringify({
          requestId: 'REQ-001',
          recipientType: 'APPLICANT',
          responseDueDate: '2026-10-15',
          message: 'Please provide information',
        }),
        ...payload,
      },
    },
  });
}

describe('parseSqsMessage', () => {
  it('parses a FURTHER_INFORMATION_REQUEST EventBridge envelope', () => {
    const parsed = parseSqsMessage(bodyWith(), parserConfig);

    expect(parsed).toMatchObject({
      sourceEventId: 'sf-event-1',
      eventType: 'FURTHER_INFORMATION_REQUEST',
      schemaVersion: '1',
      applicationId: '550e8400-e29b-41d4-a716-446655440000',
      applicationType: 'S37',
      correlationId: 'CORR-123',
      caseId: '500001',
      createdById: '005001',
      payload: {
        requestId: 'REQ-001',
        recipientType: 'APPLICANT',
        responseDueDate: '2026-10-15',
        message: 'Please provide information',
      },
    });
    expect(parsed.createdDate).toEqual(new Date('2026-09-27T10:00:00.000Z'));
  });

  it.each([
    ['an unsupported recipientType', { recipientType: 'AGENT' }],
    ['a malformed responseDueDate', { responseDueDate: '15/10/2026' }],
    ['an impossible responseDueDate', { responseDueDate: '2026-02-31' }],
    ['a message over 5000 characters', { message: 'x'.repeat(5001) }],
  ])('rejects %s as a non-retryable payload error', (_label, override) => {
    const payload = {
      requestId: 'REQ-001',
      recipientType: 'APPLICANT',
      responseDueDate: '2026-10-15',
      message: 'Please provide information',
      ...override,
    };

    expect(() => parseSqsMessage(bodyWith({ Payload__c: JSON.stringify(payload) }), parserConfig)).toThrow(
      expect.objectContaining({ code: 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', retryable: false }),
    );
  });

  it.each([
    ['a numeric recipientType', { recipientType: 42 }],
    ['a boolean recipientType that would mask typeOfInformation', { recipientType: false, typeOfInformation: 'OBJECTOR' }],
    ['a blank recipientType', { recipientType: '   ' }],
  ])('rejects %s instead of defaulting to APPLICANT', (_label, override) => {
    const payload = {
      requestId: 'REQ-001',
      responseDueDate: '2026-10-15',
      message: 'Please provide information',
      ...override,
    };

    expect(() => parseSqsMessage(bodyWith({ Payload__c: JSON.stringify(payload) }), parserConfig)).toThrow(
      expect.objectContaining({ code: 'INVALID_FURTHER_INFORMATION_REQUEST_PAYLOAD', retryable: false }),
    );
  });

  it('defaults recipientType to APPLICANT when none is sent', () => {
    const payload = {
      requestId: 'REQ-001',
      responseDueDate: '2026-10-15',
      message: 'Please provide information',
    };

    const parsed = parseSqsMessage(bodyWith({ Payload__c: JSON.stringify(payload) }), parserConfig);

    expect(parsed.payload.recipientType).toBe('APPLICANT');
  });

  it('normalises recipientType case', () => {
    const payload = {
      requestId: 'REQ-001',
      recipientType: 'objector',
      responseDueDate: '2026-10-15',
      message: 'Please provide information',
    };

    const parsed = parseSqsMessage(bodyWith({ Payload__c: JSON.stringify(payload) }), parserConfig);

    expect(parsed.payload).toMatchObject({ recipientType: 'OBJECTOR' });
  });

  it('rejects malformed envelopes as retryable contract errors', () => {
    expect(() => parseSqsMessage('{', parserConfig)).toThrow(
      expect.objectContaining({ code: 'INVALID_SQS_BODY', retryable: false }),
    );
  });

  it('rejects a non-UUID application ID', () => {
    const body = bodyWith({ Application_Id__c: 'APP-12345' });

    expect(() => parseSqsMessage(body, parserConfig)).toThrow(
      expect.objectContaining({ code: 'INVALID_APPLICATION_ID' }),
    );
  });

  it('requires the application type', () => {
    const body = bodyWith({ Application_Type__c: undefined });

    expect(() => parseSqsMessage(body, parserConfig)).toThrow(
      expect.objectContaining({ code: 'MISSING_APPLICATION_TYPE' }),
    );
  });

  it('rejects unsupported event types', () => {
    const body = bodyWith({ Event_Type__c: 'REQUEST_CREATED' });

    expect(() => parseSqsMessage(body, parserConfig)).toThrow(EventError);
    expect(() => parseSqsMessage(body, parserConfig)).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_EVENT_TYPE' }),
    );
  });
});