#!/bin/bash
set -e

echo "=== Initializing GCP Resources for viral-cue-demo ==="

export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/gcp-credentials.json
PROJECT_ID="viral-cue-demo"

# Create Pub/Sub topics
echo "Creating Pub/Sub topics..."
topics=(
  "viralcue-transcripts"
  "viralcue-clip-downloaded"
  "viralcue-drafts"
  "draft-approved"
  "viralcue-chat-messages"
  "viralcue-transcripts-dlq"
  "viralcue-viral-candidates"
  "viralcue-clips-ready"
)

for topic in "${topics[@]}"; do
  gcloud pubsub topics create "$topic" --project="$PROJECT_ID" || echo "Topic $topic already exists."
done

# Create subscriptions
echo "Creating subscriptions..."
subscriptions=(
  "viralcue-transcripts:ai-engine-sub"
  "viralcue-clip-downloaded:director-sub"
  "viralcue-drafts:dashboard-sub"
  "viralcue-chat-messages:chat-sender-sub"
  "viralcue-viral-candidates:clip-fetcher-sub"
)

for sub_pair in "${subscriptions[@]}"; do
  topic="${sub_pair%%:*}"
  sub="${sub_pair##*:}"
  gcloud pubsub subscriptions create "$sub" --topic="$topic" --project="$PROJECT_ID" || echo "Subscription $sub already exists."
done

# Create GCS buckets
echo "Creating GCS buckets..."
for bucket in viralcue-raw-clips viralcue-processed-clips viralcue-thumbnails; do
  gcloud storage buckets create "gs://$bucket" --project="$PROJECT_ID" --location="us-central1" || echo "Bucket $bucket already exists."
done

# Initialize Firestore DB (Default)
gcloud firestore databases create --location="us-central1" --project="$PROJECT_ID" || echo "Firestore database already exists."

echo "=== GCP Infrastructure Ready! ==="
