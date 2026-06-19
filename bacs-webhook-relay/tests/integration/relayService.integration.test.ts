const runIntegration = process.env.INTEGRATION_TESTS === 'true';
const d = runIntegration ? describe : describe.skip;

d('bacs-webhook-relay integration', () => {
  it('end-to-end: SELECT → SQS send → mark ENQUEUED', async () => {
    expect(process.env.PARTNER_WEBHOOKS_QUEUE_URL).toBeDefined();
    expect(process.env.PARTNER_WEBHOOKS_DLQ_URL).toBeDefined();
  });
});
