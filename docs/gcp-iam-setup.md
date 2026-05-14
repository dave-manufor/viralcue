# ViralCue GCP IAM Configuration

## Service Accounts

Create dedicated service accounts for each service with least-privilege access.

### 1. stream-monitor-sa (GKE Stream Monitor)

```bash
gcloud iam service-accounts create stream-monitor-sa \
  --display-name="Stream Monitor Service"

# Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:stream-monitor-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:stream-monitor-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 2. clip-fetcher-sa (Cloud Run Jobs)

```bash
gcloud iam service-accounts create clip-fetcher-sa \
  --display-name="Clip Fetcher Service"

# Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:clip-fetcher-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:clip-fetcher-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:clip-fetcher-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 3. ai-engine-sa (AI Processing)

```bash
gcloud iam service-accounts create ai-engine-sa \
  --display-name="AI Engine Service"

# Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ai-engine-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ai-engine-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ai-engine-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### 4. api-sa (Express API)

```bash
gcloud iam service-accounts create api-sa \
  --display-name="API Service"

# Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:api-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:api-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:api-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:api-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter"
```

### 5. functions-sa (Cloud Functions)

```bash
gcloud iam service-accounts create functions-sa \
  --display-name="Cloud Functions Service"

# Grant roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:functions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:functions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:functions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Cloud KMS Setup

```bash
# Create key ring
gcloud kms keyrings create viralcue-keys \
  --location=us-central1

# Create encryption key for tokens
gcloud kms keys create token-encryption-key \
  --location=us-central1 \
  --keyring=viralcue-keys \
  --purpose=encryption

# Create key for audit logs
gcloud kms keys create audit-log-key \
  --location=us-central1 \
  --keyring=viralcue-keys \
  --purpose=encryption
```

## Audit Logging

Enable Data Access audit logs for security monitoring:

```bash
# Enable audit logs for Pub/Sub
gcloud projects get-iam-policy $PROJECT_ID --format=json > policy.json

# Add audit log config (edit policy.json):
# {
#   "auditConfigs": [
#     {
#       "service": "pubsub.googleapis.com",
#       "auditLogConfigs": [
#         {"logType": "DATA_READ"},
#         {"logType": "DATA_WRITE"}
#       ]
#     },
#     {
#       "service": "secretmanager.googleapis.com",
#       "auditLogConfigs": [
#         {"logType": "DATA_READ"}
#       ]
#     }
#   ]
# }

gcloud projects set-iam-policy $PROJECT_ID policy.json
```

## GDPR/CCPA Compliance Patterns

### Data Deletion Request

```typescript
async function handleDataDeletionRequest(userId: string) {
  // 1. Delete from PostgreSQL
  await prisma.user.delete({ where: { id: userId } });

  // 2. Delete from Firestore
  const cardsRef = firestore.collection(`users/${userId}/cards`);
  const batch = firestore.batch();
  const cards = await cardsRef.get();
  cards.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  // 3. Delete from GCS
  await storage
    .bucket("viralcue-processed-clips")
    .deleteFiles({ prefix: `users/${userId}/` });

  // 4. Log the deletion
  console.log(`[GDPR] Deleted all data for user ${userId}`);
}
```

### Data Export Request

```typescript
async function handleDataExportRequest(userId: string) {
  const userData = {
    profile: await prisma.user.findUnique({ where: { id: userId } }),
    drafts: await prisma.draft.findMany({ where: { userId } }),
    affiliateLinks: await prisma.affiliateLink.findMany({ where: { userId } }),
  };

  return JSON.stringify(userData, null, 2);
}
```
