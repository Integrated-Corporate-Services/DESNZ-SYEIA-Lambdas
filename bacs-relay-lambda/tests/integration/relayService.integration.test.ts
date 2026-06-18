/**
 * Integration test scaffold.
 *
 * Expects a real (or LocalStack) Postgres + SQS + Secrets Manager + SSM
 * reachable via the env vars below. Skipped when INTEGRATION_TESTS=true is
 * not set so the unit suite stays hermetic.
 *
 * To run locally with LocalStack:
 *   docker run -d -p 4566:4566 localstack/localstack
 *   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15-alpine
 *   AWS_ENDPOINT_URL=http://localhost:4566 \
 *   AWS_REGION=eu-west-2 \
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=appdb \
 *   DB_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:000000000000:secret:rds \
 *   PARTNER_WEBHOOKS_QUEUE_URL=http://localhost:4566/000000000000/partner-webhooks-queue \
 *   PARTNER_WEBHOOKS_DLQ_URL=http://localhost:4566/000000000000/partner-webhooks-dlq \
 *   BACS_RELAY_BATCH_SIZE_PARAM=/bacs-relay/batch-size \
 *   INTEGRATION_TESTS=true npm run test:integration
 */
const runIntegration = process.env.INTEGRATION_TESTS === 'true';
const d = runIntegration ? describe : describe.skip;

d('bacs-relay-lambda integration', () => {
  it('end-to-end: SELECT → SQS send → mark ENQUEUED', async () => {
    expect(process.env.PARTNER_WEBHOOKS_QUEUE_URL).toBeDefined();
    expect(process.env.PARTNER_WEBHOOKS_DLQ_URL).toBeDefined();
  });
});
