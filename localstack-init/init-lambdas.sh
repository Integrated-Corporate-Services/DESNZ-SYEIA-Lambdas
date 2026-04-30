#!/bin/bash
set -e

# Create SQS queue
awslocal sqs create-queue --queue-name Pay-callback-event.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true
awslocal sqs create-queue --queue-name Pay-callback-event-dlq

# Package and deploy Lambda functions

# Helper to create lambda if zip exists
create_lambda() {
  NAME=$1
  HANDLER=$2
  ZIP=$3
  if [ -f "$ZIP" ]; then
    awslocal lambda create-function \
      --function-name $NAME \
      --runtime nodejs14.x \
      --handler $HANDLER \
      --role arn:aws:iam::000000000000:role/lambda-role \
      --zip-file fileb://$ZIP
  else
    echo "[WARN] $ZIP not found, skipping $NAME"
  fi
}

# Build zips (assumes handler is index.handler for each)
cd /var/task/pay-callback-reconciler && zip -r /tmp/pay-callback-reconciler.zip .
cd /var/task/pay-callback-relay && zip -r /tmp/pay-callback-relay.zip .
cd /var/task/inbound-event-receiver && zip -r /tmp/inbound-event-receiver.zip .

# Deploy
create_lambda pay-callback-reconciler index.handler /tmp/pay-callback-reconciler.zip
create_lambda pay-callback-relay index.handler /tmp/pay-callback-relay.zip
create_lambda inbound-event-receiver index.handler /tmp/inbound-event-receiver.zip

# Map SQS to Lambda (example for pay-callback-reconciler)
QUEUE_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/Pay-callback-event.fifo --attribute-name QueueArn --query 'Attributes.QueueArn' --output text)
awslocal lambda create-event-source-mapping --function-name pay-callback-reconciler --event-source-arn $QUEUE_ARN --batch-size 1 --enabled
