# ViralCue GCP Deployment Runbook

## Prerequisites

```bash
# Required tools
gcloud --version   # Google Cloud SDK
docker --version   # Docker for containers
kubectl version    # Kubernetes CLI
```

## 1. GCP Project Setup

```bash
# Set project
export PROJECT_ID=viralcue-prod
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
  pubsub.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  container.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  cloudkms.googleapis.com
```

## 2. Create Secrets

```bash
# Twitch credentials
echo -n "YOUR_CLIENT_ID" | gcloud secrets create twitch-client-id --data-file=-
echo -n "YOUR_CLIENT_SECRET" | gcloud secrets create twitch-client-secret --data-file=-

# Deepgram API key
echo -n "YOUR_API_KEY" | gcloud secrets create deepgram-api-key --data-file=-

# Database URL
echo -n "postgresql://..." | gcloud secrets create database-url --data-file=-
```

## 3. Create GCS Buckets

```bash
gsutil mb -l us-central1 gs://${PROJECT_ID}-raw-clips
gsutil mb -l us-central1 gs://${PROJECT_ID}-processed-clips
gsutil mb -l us-central1 gs://${PROJECT_ID}-thumbnails

# Set lifecycle (delete raw clips after 7 days)
gsutil lifecycle set lifecycle.json gs://${PROJECT_ID}-raw-clips
```

## 4. Create Pub/Sub Topics

```bash
for topic in viralcue-audio-chunks viralcue-transcripts viralcue-viral-candidates \
             viralcue-clip-downloaded viralcue-drafts viralcue-card-approved \
             viralcue-affiliate-trigger; do
  gcloud pubsub topics create $topic
done
```

## 5. Deploy Cloud Run Services

### API Service

```bash
cd services/api
gcloud run deploy viralcue-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID" \
  --service-account api-sa@$PROJECT_ID.iam.gserviceaccount.com
```

### AI Engine

```bash
cd services/ai-engine
gcloud run deploy viralcue-ai-engine \
  --source . \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID,USE_VERTEX_AI=true" \
  --service-account ai-engine-sa@$PROJECT_ID.iam.gserviceaccount.com
```

## 6. Deploy Cloud Run Job (clip-fetcher)

```bash
cd services/clip-fetcher
gcloud run jobs deploy clip-fetcher \
  --source . \
  --region us-central1 \
  --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID" \
  --service-account clip-fetcher-sa@$PROJECT_ID.iam.gserviceaccount.com
```

## 7. Deploy Cloud Functions

```bash
cd functions

# Affiliate trigger
gcloud functions deploy affiliate-trigger \
  --gen2 \
  --runtime python311 \
  --trigger-topic viralcue-affiliate-trigger \
  --source affiliate-trigger \
  --entry-point affiliate_trigger \
  --region us-central1

# Publisher webhook
gcloud functions deploy publisher-webhook \
  --gen2 \
  --runtime python311 \
  --trigger-topic viralcue-card-approved \
  --source publisher-webhook \
  --entry-point publisher_webhook \
  --region us-central1
```

## 8. Deploy GKE Autopilot (stream-monitor)

```bash
# Create cluster
gcloud container clusters create-auto viralcue-cluster \
  --region us-central1

# Get credentials
gcloud container clusters get-credentials viralcue-cluster --region us-central1

# Deploy
kubectl apply -f services/stream-monitor/k8s/
```

## 9. Verification Checklist

- [ ] API responds: `curl https://viralcue-api-xxx.run.app/health`
- [ ] Pub/Sub topics exist: `gcloud pubsub topics list`
- [ ] GCS buckets accessible: `gsutil ls`
- [ ] Firestore collection: Check Firebase console
- [ ] stream-monitor pods: `kubectl get pods -n viralcue`

## Rollback

```bash
# Cloud Run: revert to previous revision
gcloud run services update-traffic viralcue-api --to-revisions=PREVIOUS=100

# GKE: rollback deployment
kubectl rollout undo deployment/stream-monitor -n viralcue
```
