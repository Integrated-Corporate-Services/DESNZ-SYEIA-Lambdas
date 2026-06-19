// Integration test for pollAndEnqueueWebhooks
// Requires test DB and SQS (LocalStack recommended)
import { pollAndEnqueueWebhooks } from '../../src/services/pollService';
import { ensurePoolInitialized, getPool } from '../../src/database/pool';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { TABLE_PAYMENT_WEBHOOKS, STATUS_PROCESSING } from '../../src/constants';

describe('pollAndEnqueueWebhooks integration', () => {
  const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });
  const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
  let webhookId: string;
  let pool: ReturnType<typeof getPool>;
  const paymentId = 'pay_test_1777277750706_new';

  beforeAll(async () => {
    await ensurePoolInitialized();
    pool = getPool();
    webhookId = 'test-webhook-' + Date.now();
    const webhookPayload = {
      resource: {
        payment_id: paymentId,
        state: { status: 'success', finished: true },
        amount: 2500,
      },
      event_type: 'card_payment_succeeded',
      api_version: 1,
      resource_id: paymentId,
      created_date: new Date().toISOString(),
      resource_type: 'payment',
      webhook_message_id: webhookId,
    };
    await pool.query(
      `INSERT INTO ${TABLE_PAYMENT_WEBHOOKS}
        (webhook_id, payment_id, event_type, status, raw_payload, created_by, enqueued_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NULL)`,
      [
        webhookId,
        paymentId,
        'card_payment_succeeded',
        STATUS_PROCESSING,
        JSON.stringify(webhookPayload),
        'integration-test',
      ]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM ${TABLE_PAYMENT_WEBHOOKS} WHERE webhook_id = $1`, [webhookId]);
    await pool.end();
  });

  it('should enqueue DB webhook to SQS and mark as enqueued', async () => {
    const result = await pollAndEnqueueWebhooks();
    const ourResult = result.results.find((r) => r.webhookId === webhookId);
    expect(ourResult?.success).toBe(true);
    const sqsRes = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 2,
    }));
    const matchingMessage = sqsRes.Messages?.find((m) => m.Body?.includes(webhookId));
    expect(matchingMessage).toBeDefined();
    if (matchingMessage?.ReceiptHandle) {
      await sqs.send(new DeleteMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: matchingMessage.ReceiptHandle,
      }));
    }
    const dbRes = await pool.query(
      `SELECT enqueued_at FROM ${TABLE_PAYMENT_WEBHOOKS} WHERE webhook_id = $1`,
      [webhookId]
    );
    expect(dbRes.rows[0].enqueued_at).not.toBeNull();
  });
});
