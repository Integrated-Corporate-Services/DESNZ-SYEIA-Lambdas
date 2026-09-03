import type { Handler } from 'aws-lambda';

export const handler: Handler = async (_event, context) => ({
  outcome: 'SKIPPED',
  correlationId: context.awsRequestId,
  message: 'Migration preflight is provisioned but not enabled',
});
