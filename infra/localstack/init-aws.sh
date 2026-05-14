#!/bin/bash
set -e

echo "=== ViralCue Infrastructure Initializer ==="

# Wait for LocalStack to be ready
echo "Waiting for LocalStack..."
until curl -sf http://localstack:4566/_localstack/health > /dev/null 2>&1; do
  echo "  LocalStack not ready yet, waiting..."
  sleep 2
done
echo "✅ LocalStack is ready"

# Create Kinesis stream (idempotent - ignore if exists)
echo "Creating Kinesis stream..."
awslocal kinesis create-stream \
  --stream-name viralcue-audio-stream \
  --shard-count 1 2>/dev/null || echo "  (stream already exists)"
echo "✅ Kinesis stream ready"

# Wait for stream to be active
echo "Waiting for stream to be active..."
awslocal kinesis wait stream-exists --stream-name viralcue-audio-stream

# Create SQS queues (idempotent)
echo "Creating SQS queues..."
awslocal sqs create-queue --queue-name viralcue-transcripts 2>/dev/null || echo "  (queue already exists)"
awslocal sqs create-queue --queue-name viralcue-drafts 2>/dev/null || echo "  (queue already exists)"
echo "✅ SQS queues ready"

# Create S3 bucket (idempotent)
echo "Creating S3 bucket..."
awslocal s3 mb s3://viralcue-audio-archives 2>/dev/null || echo "  (bucket already exists)"
echo "✅ S3 bucket ready"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h postgres -U postgres > /dev/null 2>&1; do
  echo "  PostgreSQL not ready yet, waiting..."
  sleep 2
done
echo "✅ PostgreSQL is ready"

echo ""
echo "=== All infrastructure ready! ==="
echo ""
