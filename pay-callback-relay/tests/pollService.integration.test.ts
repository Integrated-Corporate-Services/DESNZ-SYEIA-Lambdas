// Integration test for pollAndEnqueueWebhooks
// Requires test DB and SQS (LocalStack recommended)
import { pollAndEnqueueWebhooks } from '../pollService';
import { getPool } from '../database/pool';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { TABLE_PAYMENT_WEBHOOKS, STATUS_PROCESSING } from '../constants';

describe('pollAndEnqueueWebhooks integration', () => {
  const pool = getPool();
  const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });
  const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
  let webhookId: string;
  const govukPayId = 'pay_test_1777277750706_new'; // Existing value from your test data

  beforeAll(async () => {
    // Insert a test webhook row with all required columns
    webhookId = 'test-webhook-' + Date.now();
    const webhookData = {
      resource: { state: { status: 'success', finished: true }, amount: 2500 },
      event_type: 'PAYMENT',
      api_version: 1,
      resource_id: 'test-payment',
      created_date: new Date().toISOString(),
      resource_type: 'payment',
      webhook_message_id: webhookId
    };
    await pool.query(
      `INSERT INTO ${TABLE_PAYMENT_WEBHOOKS} (webhook_id, payment_id, event_type, status, raw_payload, govuk_pay_id, webhook_data) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [webhookId, 'test-payment-001', 'PAYMENT', STATUS_PROCESSING, JSON.stringify({ foo: 'bar' }), govukPayId, JSON.stringify(webhookData)]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM ${TABLE_PAYMENT_WEBHOOKS} WHERE webhook_id = $1`, [webhookId]);
    await pool.end();
  });

  it('should enqueue DB webhook to SQS and mark as enqueued', async () => {
    const result = await pollAndEnqueueWebhooks();
    expect(result.results[0].success).toBe(true);
    // Check SQS for the message
    const sqsRes = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 2,
    }));
    expect(sqsRes.Messages && sqsRes.Messages.length).toBe(1);
    // Clean up SQS
    if (sqsRes.Messages && sqsRes.Messages[0].ReceiptHandle) {
      await sqs.send(new DeleteMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: sqsRes.Messages[0].ReceiptHandle,
      }));
    }
    // Check DB enqueued_at
    const dbRes = await pool.query(`SELECT enqueued_at FROM ${TABLE_PAYMENT_WEBHOOKS} WHERE webhook_id = $1`, [webhookId]);
    expect(dbRes.rows[0].enqueued_at).not.toBeNull();
  });
});
