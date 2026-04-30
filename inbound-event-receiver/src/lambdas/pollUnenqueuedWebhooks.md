# EventBridge Scheduler for Webhook Enqueue Lambda

This Lambda is triggered by an EventBridge rule every 15 seconds (in LocalStack or AWS).

## Purpose
- Selects webhook records from the `payment_webhooks` table where `enqueued_at IS NULL` and `status = 'processing'`.
- Sends each webhook to the SQS queue for payment processing.
- Updates the `enqueued_at` timestamp after successful enqueue.

## Environment Variables
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: PostgreSQL connection
- `AWS_REGION`, `AWS_ENDPOINT_URL`: AWS/LocalStack config
- `SQS_QUEUE_URL`: SQS queue URL

## Deployment (LocalStack Example)

1. **Build Lambda** (TypeScript → JS, e.g. with esbuild or tsc)
2. **Deploy Lambda to LocalStack**
   ```bash
   awslocal lambda create-function \
     --function-name pollUnenqueuedWebhooks \
     --runtime nodejs18.x \
     --handler pollUnenqueuedWebhooks.handler \
     --role arn:aws:iam::000000000000:role/lambda-role \
     --zip-file fileb://dist/pollUnenqueuedWebhooks.zip
   ```
3. **Create EventBridge Rule**
   ```bash
   awslocal events put-rule \
     --name webhook-enqueue-schedule \
     --schedule-expression 'rate(15 seconds)'
   ```
4. **Add Lambda Target to Rule**
   ```bash
   awslocal events put-targets \
     --rule webhook-enqueue-schedule \
     --targets '[{"Id":"1","Arn":"arn:aws:lambda:eu-west-2:000000000000:function:pollUnenqueuedWebhooks"}]'
   ```
5. **Add Lambda Permission**
   ```bash
   awslocal lambda add-permission \
     --function-name pollUnenqueuedWebhooks \
     --statement-id eventbridge-invoke \
     --action "lambda:InvokeFunction" \
     --principal events.amazonaws.com \
     --source-arn arn:aws:events:eu-west-2:000000000000:rule/webhook-enqueue-schedule
   ```

## Notes
- Make sure your Lambda bundle includes all dependencies (pg, @aws-sdk/client-sqs).
- Test locally with environment variables set for DB and SQS.
- This Lambda is stateless and safe to run in parallel.
