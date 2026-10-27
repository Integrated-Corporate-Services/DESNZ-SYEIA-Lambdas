export interface RequestAuditContext {
  sourceEventId: string;
  correlationId: string | null;
  caseId: string | null;
  applicationType: string;
}

export interface CreateRequestCommand {
  question: string;
  recipientType: string;
  deadlineAt?: string;
  externalRequestId?: string | null;
  raisedBySource: string;
  createdAt?: Date;
  audit?: RequestAuditContext;
}