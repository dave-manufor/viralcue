# ViralCue

**The Real-Time AI Co-Pilot for the Creator Economy**

![ViralCue Overview](https://img.shields.io/badge/Status-In%20Development-yellow) ![License](https://img.shields.io/badge/License-Proprietary-red)

## Overview

ViralCue is an automated, real-time "Co-Pilot" for live streamers that listens to live audio, detects viral moments and commercial opportunities using AI, and enables creators to post high-value content with a single swipe. By capturing and analyzing stream data in real-time, ViralCue removes the friction of manual clipping and social media management.

## 🚀 Key Features

*   **Real-Time Detection**: Continuously monitors live streams (Twitch) using Speech-to-Text (Deepgram).
*   **AI Viral Analysis**: Uses Large Language Models (Claude 3 / Vertex AI) to detect exciting gameplay moments, quotable statements, or affiliate product mentions.
*   **Automated Video Processing**: Automatically downloads VODs, clips the detected timeframe, and transcodes to 9:16 vertical format for TikTok/Reels/Shorts.
*   **Swipe Dashboard**: A Tinder-like PWA interface for creators to quickly review, edit, and approve AI-generated social media drafts.
*   **Auto-Publishing**: One-click publishing to integrated platforms like TikTok, X (Twitter), Instagram, and YouTube.

## 🏗️ Architecture & Tech Stack

ViralCue utilizes a robust microservices architecture designed for real-time processing and scalability.

| Component | Technology | Description |
|-----------|------------|-------------|
| **Frontend Dashboard** | Next.js, React, Tailwind CSS | PWA dashboard with WebSocket real-time updates. |
| **API Gateway** | Express.js, TypeScript | REST API + WebSocket server managing auth & data orchestration. |
| **Ingestion (Audio)** | Python, Deepgram | Captures live HLS streams and processes real-time Speech-to-Text. |
| **AI Engine** | Python, AWS Bedrock / Vertex | Analyzes context window for viral score and generates drafts. |
| **Video Processor** | Python (Cloud Run) | Fetches Twitch VODs, clips, transcodes, and uploads to cloud storage. |
| **Database & Cache** | PostgreSQL (Prisma), Redis | Stores user data, sessions, OAuth tokens, and rate limits. |
| **Messaging** | GCP Pub/Sub / AWS Kinesis | Async event bus for inter-service communication. |

## 📂 Project Structure

```text
viralcue/
├── apps/               # Frontend applications
│   ├── web/            # Next.js Dashboard
│   └── extension/      # Chrome Extension
├── services/           # Backend Microservices
│   ├── stream-monitor/ # Twitch/Audio Monitoring (GKE)
│   ├── clip-fetcher/   # Video Downloading (Cloud Run Job)
│   ├── ai-engine/      # Video Analysis (Vertex AI / Bedrock)
│   ├── hls-fetcher/    # Audio ingestion
│   └── api/            # Main API Gateway (Express)
├── functions/          # Cloud Functions (Triggers / Webhooks)
├── packages/           # Shared Libraries
│   ├── db/             # Prisma schema & Database Client
│   ├── ui/             # Shared UI components
│   └── shared/         # Shared Utilities
├── infra/              # Terraform & Infrastructure Code
└── docs/               # Detailed Architecture & Development Documentation
```

## 🛠️ Local Development

### Prerequisites

Ensure you have the following installed:
*   **Docker Desktop** (for local infrastructure emulators)
*   **Node.js v20+** & **pnpm**
*   **Python 3.11+**
*   **Google Cloud SDK** (optional, for real GCP integration)

### Getting Started

1.  **Clone & Install Dependencies**
    ```bash
    git clone https://github.com/viralcue/viralcue.git
    cd viralcue
    pnpm install
    ```

2.  **Environment Setup**
    ```bash
    cp .env.example .env
    ```
    *Update the `.env` with specific keys as needed.*

3.  **Start Local Infrastructure**
    We use Docker Compose to run local emulators (Postgres, Redis, Pub/Sub, etc.).
    ```bash
    docker-compose -f docker-compose.gcp.yml up -d
    ```

4.  **Run the Web Dashboard**
    ```bash
    pnpm dev
    ```
    *The app will be available at `http://localhost:3000`.*

5.  **Run Microservices (Python)**
    Each Python service can be run locally within its own virtual environment.
    ```bash
    cd services/ai-engine
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    python src/main.py
    ```

## 📚 Documentation

For more detailed information, please refer to the `docs/` directory:
*   [Development Guide](docs/DEVELOPMENT.md)
*   [Architecture Flow](docs/architecture_flow.md)
*   [Suggested Implementation Plan](docs/suggested-plan.md)
*   [API Documentation](docs/api-documentation.md)

## 📄 License

UNLICENSED - Proprietary code. All rights reserved.
