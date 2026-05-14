# ViralCue

**The Real-Time AI Co-Pilot for the Creator Economy**

## Overview

ViralCue is an automated, real-time "Co-Pilot" that listens to live audio, detects viral moments and commercial opportunities using AI, and enables creators to post high-value content with a single swipe.

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS |
| **API** | Express.js, TypeScript, Prisma |
| **Audio Processing** | Python, Deepgram SDK |
| **AI Engine** | Python, Amazon Bedrock (Claude) |
| **Infrastructure** | AWS, Terraform |

## Project Structure

```
viralcue/
├── apps/
│   ├── web/              # Next.js PWA (Swipe Dashboard)
│   ├── extension/        # Chrome extension
│   └── landing/          # Marketing site
├── packages/
│   ├── ui/               # Shared UI components
│   ├── db/               # Prisma schema
│   └── shared/           # Shared types/utils
├── services/
│   ├── api/              # Express.js API (TypeScript)
│   ├── audio-processor/  # Deepgram integration (Python)
│   └── ai-engine/        # Bedrock integration (Python)
└── infra/
    └── terraform/        # AWS infrastructure
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build all packages
pnpm build
```

## License

UNLICENSED - Proprietary
