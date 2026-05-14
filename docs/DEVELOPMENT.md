# ViralCue Local Development Guide

Welcome to the ViralCue development team! This guide will help you set up your local environment to build, run, and test the ViralCue platform.

## 📋 Prerequisites

Ensure you have the following tools installed:

- **Docker Desktop** (for containerization and emulators)
- **Node.js v20+** & **pnpm** (Package manager)
- **Python 3.11+** (Microservices & AI)
- **Google Cloud SDK** (`gcloud`)
- **kubectl** (Kubernetes CLI)
- **Make** (optional, for convenience scripts)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/viralcue/viralcue.git
cd viralcue
```

### 2. Install Dependencies

**Frontend & Typescript Services (Monorepo Root):**

```bash
pnpm install
```

**Python Services (e.g., ai-engine):**
It is recommended to create a virtual environment for each python service or a shared one.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/ai-engine/requirements.txt
pip install -r services/stream-monitor/requirements.txt
# ... repeat for other python services
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your specific keys if needed, though defaults work for the local emulator stack.

## 🛠️ Local Infrastructure

We use `docker-compose` to run GCP emulators and databases locally. This mimics our production GCP environment.

**Start the Infrastructure:**

```bash
docker-compose -f docker-compose.gcp.yml up -d
```

**What's Running:**

- **PostgreSQL:** Port `5432` (Auth, User Data)
- **Redis:** Port `6379` (Caching)
- **Pub/Sub Emulator:** Port `8085` (Event Bus)
- **Firestore Emulator:** Port `8086` (Real-time DB)
- **Fake GCS Server:** Port `4443` (Blob Storage)
- **GCP Init:** Auto-creates topics and buckets.

**Verify Infrastructure:**

```bash
curl http://localhost:8085  # Pub/Sub (should say "Ok")
curl http://localhost:8086  # Firestore
curl http://localhost:4443/storage/v1/b # GCS (lists buckets)
```

## 🏃 Running Services

### Web Frontend (Next.js)

```bash
pnpm dev
# App available at http://localhost:3000
```

### Microservices

#### **Stream Monitor (Python/GKE)**

This service connects to Twitch Chat and Audio.

```bash
cd services/stream-monitor
# Ensure you are in your venv and env vars are set (export $(cat ../../.env | xargs))
python src/main.py
```

#### **AI Engine (Python/Cloud Run)**

Handles video analysis with Vertex AI (or mock).

```bash
cd services/ai-engine
python src/main.py
```

_Note: Set `USE_VERTEX_AI=false` in `.env` to use the local mock provider._

#### **Clip Fetcher (Python/Cloud Run Job)**

Runs on demand via Pub/Sub trigger.

```bash
cd services/clip-fetcher
python src/main.py
```

### Cloud Functions

You can test functions using `functions-framework`.

```bash
cd functions/affiliate-trigger
functions-framework --target=affiliate_trigger --port=8081
```

## 🧪 Testing

### Integration Tests

To run the end-to-end integration tests (Pub/Sub flow), you must explicitly enable them and install test dependencies.

```bash
# Install test dependencies
pip install -r tests/requirements.txt

# Set flag and run
export RUN_INTEGRATION_TESTS=true
pytest tests/integration/test_pubsub_flow.py -v
```

### Unit Tests

Run unit tests across the monorepo:

```bash
pnpm test
```

## 📂 Project Structure

```
viralcue/
├── apps/               # Frontend applications
│   ├── web/            # Next.js Dashboard
│   └── extension/      # Chrome Extension
├── services/           # Backend Microservices
│   ├── stream-monitor/ # Twitch/Audio Monitoring (GKE)
│   ├── clip-fetcher/   # Video Downloading (Cloud Run Job)
│   ├── ai-engine/      # Video Analysis (Vertex AI)
│   └── api/            # Main API Gateway (Express)
├── functions/          # Cloud Functions (Triggers)
├── packages/           # Shared Libraries
│   ├── db/             # Prisma & Database Client
│   └── shared/         # Shared Utilities & GCP Clients
├── infra/              # Terraform & Infrastructure Code
└── docs/               # Documentation
```

## 🐛 Troubleshooting

**Port Conflicts:**
If ports (5432, 6379, 8085, etc.) are in use, check if you have other postgres/redis instances running locally and stop them.

**Emulator Issues:**
If Pub/Sub topics are missing, restart the `init-gcp` container:

```bash
docker-compose -f docker-compose.gcp.yml restart init-gcp
```

**Vertex AI Errors:**
If you get credential errors, ensure `USE_VERTEX_AI=false` is set for local dev, or authenticate with `gcloud auth application-default login` if you want to use the real API (and set `GCP_PROJECT_ID` to your dev project).
