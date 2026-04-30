#!/bin/bash

# LocalStack initialization script
# This runs when LocalStack container starts
# Creates SQS queue for local testing

echo "🚀 Initializing LocalStack SQS..."

# Wait for LocalStack to be ready
sleep 2

# Create DLQ
awslocal sqs create-queue \
  --queue-name Pay-callback-event-dlq \
  --region eu-west-2

# Get DLQ ARN
DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/Pay-callback-event-dlq \
  --attribute-name QueueArn \
  --region eu-west-2 \
  --query 'Attributes.QueueArn' --output text)

# Create main FIFO queue with DLQ redrive policy
awslocal sqs create-queue \
  --queue-name Pay-callback-event.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true,RedrivePolicy="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"5\"}" \
  --region eu-west-2

echo "✅ SQS queues created: Pay-callback-event.fifo, Pay-callback-event-dlq"

# Get main queue URL
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name Pay-callback-event.fifo --region eu-west-2 --output text)
echo "📋 Main Queue URL: $QUEUE_URL"

# Set queue attributes (optional)
awslocal sqs set-queue-attributes \
  --queue-url $QUEUE_URL \
  --attributes VisibilityTimeout=30,MessageRetentionPeriod=345600

echo "✅ LocalStack SQS initialization complete!"
