#!/bin/bash
set -e

export PATH="/Users/MAC/google-cloud-sdk/bin:$PATH"

PROJECT_ID="clausync-demo"
REGION="us-central1"
UNIQUE_SUFFIX=$(LC_ALL=C cat /dev/urandom | LC_ALL=C tr -dc 'a-z0-9' | fold -w 6 | head -n 1)
# You can also just use $PROJECT_ID as suffix
BUCKET_SUFFIX="-$PROJECT_ID"

echo "=== ViralCue Demo Deployment Script ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"

# 0. Set up infrastructure first (Topics, Buckets, Firestore)
echo "=== Setting up GCP Infrastructure ==="
gcloud services enable run.googleapis.com pubsub.googleapis.com storage.googleapis.com firestore.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project $PROJECT_ID || true

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

echo "Creating GCS buckets..."
for bucket_base in viralcue-raw-clips viralcue-processed-clips viralcue-thumbnails; do
  bucket="${bucket_base}${BUCKET_SUFFIX}"
  gcloud storage buckets create "gs://$bucket" --project="$PROJECT_ID" --location="$REGION" || echo "Bucket $bucket already exists."
done

echo "Initializing Firestore..."
gcloud firestore databases create --location="$REGION" --project="$PROJECT_ID" || echo "Firestore database already exists."

echo "Creating Artifact Registry..."
gcloud artifacts repositories create viralcue-repo --repository-format=docker --location=$REGION --description="Docker repository for ViralCue" --project=$PROJECT_ID || echo "Artifact repository already exists."

echo "=== Deploying Services to Cloud Run ==="

# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# 1. API Service (Node.js) - Built via gcloud builds submit because of PNPM workspace
echo "Deploying API Service..."
gcloud builds submit --config infra/cloudbuild.api.yaml --substitutions=_PROJECT_ID=$PROJECT_ID,_REGION=$REGION .

gcloud run deploy viralcue-api \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/viralcue-repo/viralcue-api \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=${DATABASE_URL},DIRECT_URL=${DIRECT_URL},RAW_CLIPS_BUCKET=viralcue-raw-clips${BUCKET_SUFFIX},PROCESSED_CLIPS_BUCKET=viralcue-processed-clips${BUCKET_SUFFIX},THUMBNAILS_BUCKET=viralcue-thumbnails${BUCKET_SUFFIX}" \
  --format="value(status.url)" > api_url.txt
API_URL=$(cat api_url.txt)
echo "API URL: $API_URL"

# 2. Publisher Webhook (Python/Flask or similar)
echo "Deploying Publisher Webhook..."
gcloud run deploy publisher-webhook \
  --source ./functions/publisher-webhook \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --format="value(status.url)" > publisher_url.txt
PUBLISHER_URL=$(cat publisher_url.txt)
echo "Publisher Webhook URL: $PUBLISHER_URL"

# 3. AI Engine (Python)
echo "Deploying AI Engine..."
gcloud run deploy ai-engine \
  --source ./services/ai-engine \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="PUBSUB_MODE=push,USE_GCP_PUBSUB=true,API_BASE_URL=$API_URL" \
  --format="value(status.url)" > ai_engine_url.txt
AI_ENGINE_URL=$(cat ai_engine_url.txt)
echo "AI Engine URL: $AI_ENGINE_URL"

# 4. Clip Fetcher (Python)
echo "Deploying Clip Fetcher..."
gcloud run deploy clip-fetcher \
  --source ./services/clip-fetcher \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="PUBSUB_MODE=push,API_URL=$API_URL,RAW_CLIPS_BUCKET=viralcue-raw-clips${BUCKET_SUFFIX},PROCESSED_CLIPS_BUCKET=viralcue-processed-clips${BUCKET_SUFFIX},THUMBNAILS_BUCKET=viralcue-thumbnails${BUCKET_SUFFIX}" \
  --format="value(status.url)" > clip_fetcher_url.txt
CLIP_FETCHER_URL=$(cat clip_fetcher_url.txt)
echo "Clip Fetcher URL: $CLIP_FETCHER_URL"

# 5. Chat Sender (Python)
echo "Deploying Chat Sender..."
gcloud run deploy chat-sender \
  --source ./services/chat-sender \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="PUBSUB_MODE=push" \
  --format="value(status.url)" > chat_sender_url.txt
CHAT_SENDER_URL=$(cat chat_sender_url.txt)
echo "Chat Sender URL: $CHAT_SENDER_URL"

# 6. HLS Fetcher (Python)
echo "Deploying HLS Fetcher..."
gcloud run deploy hls-fetcher \
  --source ./services/hls-fetcher \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --timeout=3600 \
  --format="value(status.url)" > hls_fetcher_url.txt
HLS_FETCHER_URL=$(cat hls_fetcher_url.txt)
echo "HLS Fetcher URL: $HLS_FETCHER_URL"


echo "=== Configuring Pub/Sub Push Subscriptions ==="

# Delete old pull subscriptions if they exist
subs_to_delete=(
  "ai-engine-sub"
  "clip-fetcher-sub"
  "chat-sender-sub"
  "publisher-sub"
)
for sub in "${subs_to_delete[@]}"; do
  gcloud pubsub subscriptions delete "$sub" --project $PROJECT_ID || true
done

# Create Push Subscriptions
gcloud pubsub subscriptions create ai-engine-sub \
  --topic viralcue-transcripts \
  --push-endpoint="$AI_ENGINE_URL/pubsub/push" \
  --project $PROJECT_ID

gcloud pubsub subscriptions create clip-fetcher-sub \
  --topic viralcue-viral-candidates \
  --push-endpoint="$CLIP_FETCHER_URL/pubsub/push" \
  --project $PROJECT_ID

gcloud pubsub subscriptions create chat-sender-sub \
  --topic viralcue-chat-messages \
  --push-endpoint="$CHAT_SENDER_URL/pubsub/push" \
  --project $PROJECT_ID

gcloud pubsub subscriptions create publisher-sub \
  --topic draft-approved \
  --push-endpoint="$PUBLISHER_URL" \
  --project $PROJECT_ID

echo "=== Deployment Complete! ==="
echo "Make sure to update your Next.js Vercel Environment Variables with the following:"
echo "NEXT_PUBLIC_API_URL=$API_URL"
echo "RAW_CLIPS_BUCKET=viralcue-raw-clips${BUCKET_SUFFIX}"
echo "PROCESSED_CLIPS_BUCKET=viralcue-processed-clips${BUCKET_SUFFIX}"
echo "THUMBNAILS_BUCKET=viralcue-thumbnails${BUCKET_SUFFIX}"
