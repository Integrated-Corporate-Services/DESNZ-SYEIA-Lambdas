export interface CreateRequestCommand {
  question: string;
  deadlineAt?: string;
  requestedDocuments?: string[];
  externalRequestId?: string | null;
  raisedBySource: string;
  createdAt?: Date;
}