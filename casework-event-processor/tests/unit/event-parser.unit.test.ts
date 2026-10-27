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
  it('parses the Further_Information_Request_Event__e payload Salesforce sends', () => {
    const body = JSON.stringify({
      version: '0',
      id: '1bcc1a95-3a4d-c2ea-3088-34c7ac784e79',
      'detail-type': 'Further_Information_Request_Event__e',
      source: 'aws.partner/salesforce.com/00DAe000009QgrFMAS/0YLAe00000093OTOAY',
      detail: {
        payload: {
          Type_of_Application__c: 'NWL',
          CreatedById: '005Ae00000LSGkEIAX',
          Payload__c: '{\n  "requestId" : "FIR-0126",\n  "responseDueDate" : "2026-10-28",\n  "message" : "need docs"\n}',
          CreatedDate: '2026-10-27T17:31:36.565Z',
          Case__c: 'a03Ae00001EwLjaIAF',
          AWS_Application_Id__c: '2694fd70-424a-4129-87bf-f5c490fa01e2',
        },
        schemaId: '3szeI_LDKMdpEzER5fvYaA',
        id: '3d8f069a-aab2-4279-b90d-e9e36323dd41',
      },
    });
    const config = { ...parserConfig, detailType: 'Casework_Event__e,Further_Information_Request_Event__e' };

    const parsed = parseSqsMessage(body, config);

    expect(parsed).toMatchObject({
      sourceEventId: '1bcc1a95-3a4d-c2ea-3088-34c7ac784e79',
      eventType: 'FURTHER_INFORMATION_REQUEST',
      schemaVersion: '1',
      applicationId: '2694fd70-424a-4129-87bf-f5c490fa01e2',
      applicationType: 'NWL',
      correlationId: '3d8f069a-aab2-4279-b90d-e9e36323dd41',
      caseId: 'a03Ae00001EwLjaIAF',
      createdById: '005Ae00000LSGkEIAX',
      payload: {
        requestId: 'FIR-0126',
        recipientType: 'APPLICANT',
        responseDueDate: '2026-10-28',
        message: 'need docs',
      },
    });
  });

  it('requires Event_Type__c on events other than Further_Information_Request_Event__e', () => {
    expect(() => parseSqsMessage(bodyWith({ Event_Type__c: undefined }), parserConfig)).toThrow(
      expect.objectContaining({ code: 'MISSING_EVENT_TYPE' }),
    );
  });

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