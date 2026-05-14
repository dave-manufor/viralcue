# ViralCue - Implementation Plan & System Architecture

## Executive Summary

ViralCue is an AI-powered co-pilot for live streamers that detects viral moments in real-time and generates ready-to-post social media content. The system captures audio from the streamer's own live broadcasts, analyzes it for engaging moments, and surfaces content drafts for approval.

---

## Core Principles

| Principle                   | Description                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| **Legal Compliance**        | Users can only analyze streams from their own connected accounts      |
| **MVP Simplicity**          | Browser extension for audio capture (minimizes infrastructure cost)   |
| **Server-Side Validation**  | All authorization enforced at the API layer, never trust client       |
| **Progressive Enhancement** | Start with Twitch, expand to other platforms incrementally            |
| **Industry Standards**      | OAuth 2.0, JWT tokens, HTTPS everywhere, GDPR-compliant data handling |

---

## Part 1: System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VIRALCUE ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

                          ┌──────────────────────┐
                          │     AWS Cognito      │
                          │   (Authentication)   │
                          └──────────┬───────────┘
                                     │ JWT
                                     ▼
┌──────────────┐     ┌──────────────────────────────┐
│   Browser    │◀───▶│       Next.js Dashboard      │
│  Extension   │     │          (PWA)               │
└──────┬───────┘     └──────────────┬───────────────┘
       │                            │
       │                            │ REST API + WebSocket
       │                            │ (All data via API only)
       │                            ▼
       │              ┌──────────────────────────────┐     ┌─────────────────┐
       └─────────────▶│        API Server            │────▶│   PostgreSQL    │
                      │       (Express.js)           │     │    (Aurora)     │
                      └──────────────┬───────────────┘     └─────────────────┘
                                     │
                      ┌──────────────┼───────────────┐
                      │              │               │
                      ▼              ▼               ▼
              ┌───────────┐  ┌───────────┐  ┌───────────────┐
              │  Kinesis  │  │    SQS    │  │     Redis     │
              │  (Audio)  │  │ (Messages)│  │   (Cache)     │
              └─────┬─────┘  └─────┬─────┘  └───────────────┘
                    │              │
                    ▼              ▼
              ┌───────────────────────────┐
              │     Audio Processor       │
              │    (Python/Deepgram)      │
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │        AI Engine          │
              │    (Python/Bedrock)       │
              └───────────────────────────┘

  ⚠️ IMPORTANT: Frontend NEVER touches database directly.
     All data flows through API Server.
```

### Data Flow Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND ↔ BACKEND COMMUNICATION                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ❌ WRONG: Dashboard ──────────────────────────────▶ Database              │
│                                                                             │
│  ✅ CORRECT:                                                                │
│                                                                             │
│     Dashboard ──── REST API ────▶ API Server ────▶ Database                │
│                                                                             │
│     Dashboard ◀─── WebSocket ───▶ API Server ────▶ Database                │
│                    (Real-time)                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### WebSocket Connections

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEBSOCKET ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Dashboard connects to 2 WebSocket channels:                                │
│                                                                             │
│  1. WS /ws/dashboard?token=JWT                                              │
│     └─ Receives: DRAFT_NEW, DRAFT_UPDATE, STREAM_STATUS, NOTIFICATIONS      │
│     └─ Sends: DRAFT_ACTION (approve/reject)                                 │
│                                                                             │
│  2. Extension connects to:                                                  │
│     WS /ws/audio?streamId=xxx&token=JWT                                     │
│     └─ Sends: AUDIO chunks                                                  │
│     └─ Receives: CONNECTED, ERROR                                           │
│                                                                             │
│  API Server pushes updates to Dashboard WebSocket when:                     │
│     • New draft is generated                                                │
│     • Stream status changes                                                 │
│     • Extension connects/disconnects                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component           | Technology                     | Responsibility                                    |
| ------------------- | ------------------------------ | ------------------------------------------------- |
| **Dashboard**       | Next.js 16, React 19, Tailwind | User interface, stream selection, draft approval  |
| **Extension**       | Chrome Manifest V3 (Deferred)  | Optional: quick access, streaming site detection  |
| **API**             | Express.js, TypeScript         | Authentication, authorization, data orchestration |
| **HLS Fetcher**     | Python, aiohttp                | Server-side Twitch audio capture via HLS          |
| **Audio Processor** | Python, Deepgram               | Real-time speech-to-text (via HLS Fetcher)        |
| **AI Engine**       | Python, AWS Bedrock            | Viral moment detection, draft generation          |
| **Database**        | PostgreSQL (Aurora)            | Users, sessions, drafts, affiliate links          |
| **Cache**           | Redis (ElastiCache)            | Session state, rate limiting                      |
| **Queue**           | AWS Kinesis, SQS               | Async message passing                             |
| **Auth**            | Clerk                          | Identity management, OAuth federation             |

---

## Part 2: Data Flows

### Flow 1: User Authentication

```
┌─────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
│  User   │────▶│ Dashboard │────▶│ Cognito │────▶│  Twitch  │
└─────────┘     └───────────┘     └─────────┘     └──────────┘
                     │                 │               │
                     │                 │◀──────────────┘
                     │                 │   OAuth callback
                     │◀────────────────┘
                     │   JWT + User info
                     │
                     ▼
              ┌───────────┐
              │    API    │ Create/update user in DB
              └───────────┘
```

**Data Exchanged:**

- Cognito → Twitch: OAuth authorization request
- Twitch → Cognito: Authorization code
- Cognito → Dashboard: JWT (access + refresh tokens)
- Dashboard → API: JWT in Authorization header
- API → DB: User profile (id, twitchId, email, subscription)

### Flow 2: Platform Connection

```
┌─────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
│  User   │────▶│ Dashboard │────▶│   API   │────▶│  Twitch  │
│         │     │ Settings  │     │         │     │  OAuth   │
└─────────┘     └───────────┘     └─────────┘     └──────────┘
                                       │               │
                                       │◀──────────────┘
                                       │  Access + Refresh tokens
                                       ▼
                                 ┌───────────┐
                                 │    DB     │ Store encrypted tokens
                                 └───────────┘
```

**Data Stored:**

```typescript
interface PlatformConnection {
  userId: string;
  platform: "TWITCH" | "YOUTUBE" | "TWITTER";
  platformUserId: string;
  platformUsername: string;
  accessToken: string; // Encrypted at rest
  refreshToken: string; // Encrypted at rest
  scopes: string[];
  expiresAt: Date;
  connectedAt: Date;
}
```

### Flow 3: Stream Detection & Selection

```
┌─────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
│  User   │────▶│ Dashboard │────▶│   API   │────▶│  Twitch  │
│         │     │  /live    │     │         │     │   API    │
└─────────┘     └───────────┘     └─────────┘     └──────────┘
                     ▲                 │               │
                     │                 │◀──────────────┘
                     │                 │  Stream data (if live)
                     │◀────────────────┘
                     │  User's active streams only
```

**API Call:**

```
GET https://api.twitch.tv/helix/streams?user_id={connected_user_twitch_id}
Authorization: Bearer {stored_access_token}
```

**Validation (Server-Side):**

```typescript
// CRITICAL: Only return streams the user owns
const connection = await db.platformConnection.findFirst({
  where: { userId: authenticatedUser.id, platform: "TWITCH" },
});

const streams = await twitchApi.getStreams({
  user_id: connection.platformUserId, // Only this user's streams
});
```

### Flow 4: Audio Capture & Streaming

```
┌───────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
│ Extension │────▶│ Dashboard │────▶│   API   │────▶│ Kinesis  │
│           │     │           │     │   WS    │     │          │
└───────────┘     └───────────┘     └─────────┘     └──────────┘
      │                                   │
      │ 1. Tab audio capture              │ 3. Validate ownership
      │ 2. Send via WebSocket             │ 4. Forward to Kinesis
      ▼                                   ▼
┌───────────┐                       ┌───────────┐
│  Browser  │                       │    DB     │ Log session
│   Tab     │                       └───────────┘
└───────────┘
```

**WebSocket Protocol:**

```typescript
// Connection
ws://api.viralcue.io/ws/audio?streamId=xxx&token=JWT

// Messages (Extension → API)
{ type: "AUDIO_CHUNK", data: Base64PCM, timestamp: number }
{ type: "HEARTBEAT" }

// Messages (API → Extension)
{ type: "CONNECTED", sessionId: string }
{ type: "DRAFT_GENERATED", draft: Draft }
{ type: "ERROR", message: string }
```

### Flow 5: Transcription Pipeline

```
┌──────────┐     ┌───────────────┐     ┌──────────┐     ┌─────────┐
│ Kinesis  │────▶│Audio Processor│────▶│ Deepgram │────▶│   SQS   │
│          │     │               │     │  Nova-2  │     │         │
└──────────┘     └───────────────┘     └──────────┘     └─────────┘
                                                              │
                                                              ▼
                                                       ┌───────────┐
                                                       │ AI Engine │
                                                       └───────────┘
```

**Deepgram Configuration:**

```python
config = {
    "model": "nova-2",
    "language": "en",
    "smart_format": True,
    "punctuate": True,
    "diarize": True,       # Speaker identification
    "utterances": True,    # Sentence boundaries
}
```

### Flow 6: Draft Generation

```
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│   SQS   │────▶│ AI Engine │────▶│ Bedrock  │────▶│    DB    │
│         │     │           │     │ Claude 3 │     │          │
└─────────┘     └───────────┘     └──────────┘     └──────────┘
                     │                                   │
                     │ Match affiliate keywords          │
                     ▼                                   │
              ┌───────────┐                              │
              │ User's    │                              │
              │ Affiliate │                              │
              │  Links    │──────────────────────────────┘
              └───────────┘
```

**AI Prompt Structure:**

```
You are analyzing a live stream transcript to identify viral-worthy moments.

Context:
- Streamer: {username}
- Platform: {platform}
- Stream Title: {title}
- Recent Transcript (last 5 min): {transcript}

Affiliate Products Available:
{affiliate_links}

Task: Generate a tweet-ready post if you detect:
1. An exciting gameplay moment
2. A quotable/funny statement
3. A product mention matching affiliate keywords

Output JSON:
{
  "shouldGenerate": boolean,
  "content": "Tweet text with emojis",
  "type": "TWEET" | "AFFILIATE" | "CLIP",
  "confidence": 0.0-1.0,
  "matchedAffiliate": "product_id" | null,
  "reason": "Brief explanation"
}
```

---

## Part 3: Implementation Phases

### Phase 1: Core MVP (Current)

**Goal:** End-to-end flow for a single Twitch user

#### Backend Tasks

| Task                        | Status      | Files                       | Description                        |
| --------------------------- | ----------- | --------------------------- | ---------------------------------- |
| Express.js API setup        | ✅ Done     | `services/api/`             | Routes, middleware, error handling |
| Clerk JWT validation        | ✅ Done     | `middleware/clerk-auth.ts`  | Verify JWT via Clerk SDK           |
| Twitch OAuth (platform)     | ✅ Done     | `routes/auth.ts`            | Connect Twitch account             |
| Socket.IO dashboard         | ✅ Done     | `websocket/dashboard.ts`    | Real-time draft updates            |
| Stream ownership validation | ✅ Done     | `middleware/stream-auth.ts` | Verify user owns stream            |
| HLS Fetcher service         | ✅ Done     | `services/hls-fetcher/`     | Server-side audio capture          |
| AI Engine service           | ⚠️ Scaffold | `services/ai-engine/`       | Transcripts → Drafts               |
| Drafts CRUD API             | ✅ Done     | `routes/drafts.ts`          | List, approve, reject              |

#### Frontend Tasks

| Task                  | Status  | Files                             | Description            |
| --------------------- | ------- | --------------------------------- | ---------------------- |
| Next.js app setup     | ✅ Done | `apps/web/`                       | PWA with Tailwind      |
| Login page            | ✅ Done | `app/login/page.tsx`              | Clerk SignIn           |
| Auth (Clerk)          | ✅ Done | ClerkProvider                     | Session management     |
| Dashboard layout      | ✅ Done | `app/dashboard/layout.tsx`        | Sidebar, header        |
| Swipe draft interface | ✅ Done | `app/dashboard/live/page.tsx`     | Framer Motion gestures |
| Settings page         | ✅ Done | `app/dashboard/settings/page.tsx` | Profile, notifications |
| Extension detection   | ✅ Done | `hooks/use-extension.ts`          | CustomEvent pattern    |
| Dashboard Socket      | ✅ Done | `hooks/use-dashboard-socket.ts`   | Socket.IO client       |

#### Extension Tasks (Deferred)

| Task                  | Status      | Files         | Description             |
| --------------------- | ----------- | ------------- | ----------------------- |
| Plasmo + Clerk setup  | ✅ Done     | `popup.tsx`   | Session sync            |
| Content script bridge | ✅ Done     | `content.tsx` | CustomEvent detection   |
| Audio capture         | ⏸️ Deferred | -             | Replaced by HLS Fetcher |

---

### Phase 2: Platform Connections

**Goal:** Multi-platform OAuth, stream detection, affiliate management

#### Backend Tasks

| Task                            | Files                       | Description                       |
| ------------------------------- | --------------------------- | --------------------------------- |
| Platform connections table      | `prisma/schema.prisma`      | Store OAuth tokens per platform   |
| Token encryption                | `lib/crypto.ts`             | AES-256 for access/refresh tokens |
| Connections CRUD API            | `routes/connections.ts`     | Connect, disconnect, list         |
| Twitch OAuth scopes             | `routes/auth.ts`            | Add `user:read:broadcast`         |
| Stream detection endpoint       | `routes/streams.ts`         | Poll platform APIs                |
| Ownership validation middleware | `middleware/stream-auth.ts` | Server-side ownership check       |
| Affiliate links API             | `routes/affiliate-links.ts` | CRUD with keyword matching        |
| Token refresh job               | `jobs/refresh-tokens.ts`    | Background token rotation         |

#### Frontend Tasks

| Task                     | Files                                 | Description                  |
| ------------------------ | ------------------------------------- | ---------------------------- |
| Connected accounts UI    | `app/dashboard/settings/connections/` | Platform cards               |
| Connect button flows     | `components/connect-platform.tsx`     | OAuth popups                 |
| Stream selection page    | `app/dashboard/streams/`              | List user's live streams     |
| Stream card component    | `components/stream-card.tsx`          | Live indicator, viewer count |
| Extension required modal | `components/extension-modal.tsx`      | Install prompt               |
| Affiliate links manager  | `app/dashboard/affiliates/`           | Add, edit, delete links      |
| Keyword tag input        | `components/keyword-input.tsx`        | Multi-select tags            |

#### Database Schema Additions

```prisma
model PlatformConnection {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  platform        Platform
  platformUserId  String
  platformUsername String
  accessToken     String   // Encrypted
  refreshToken    String   // Encrypted
  scopes          String[]
  expiresAt       DateTime
  connectedAt     DateTime @default(now())

  @@unique([userId, platform])
}

enum Platform {
  TWITCH
  YOUTUBE
  TWITTER
  TIKTOK
  LINKEDIN
  THREADS
}
```

---

### Phase 3: Real-Time Integration

**Goal:** Seamless extension ↔ webapp communication

#### Backend Tasks

| Task                    | Files                 | Description                  |
| ----------------------- | --------------------- | ---------------------------- |
| Session state in Redis  | `lib/redis.ts`        | Track active streams         |
| Real-time draft push    | `websocket/drafts.ts` | Push new drafts to dashboard |
| Stream session tracking | `routes/sessions.ts`  | Start, end, duration         |
| Analytics events        | `lib/analytics.ts`    | Usage metrics                |

#### Frontend Tasks

| Task                         | Files                              | Description              |
| ---------------------------- | ---------------------------------- | ------------------------ |
| Extension bridge module      | `lib/extension-bridge.ts`          | Detect, activate, status |
| WebSocket draft subscription | `hooks/use-drafts.ts`              | Real-time draft updates  |
| Connection status indicator  | `components/connection-status.tsx` | Extension + API status   |
| Stream monitoring page       | `app/dashboard/live/[streamId]/`   | Per-stream view          |
| Draft queue with animations  | `components/draft-queue.tsx`       | Incoming draft cards     |

#### Extension Tasks

| Task                      | Files           | Description              |
| ------------------------- | --------------- | ------------------------ |
| Content script injection  | `content.js`    | Expose window.viralcue   |
| Dashboard message handler | `background.js` | ACTIVATE, DEACTIVATE     |
| Status broadcasting       | `background.js` | Notify webapp of state   |
| Error recovery            | `background.js` | Auto-reconnect WebSocket |

#### Extension-WebApp Bridge Protocol

```typescript
// Exposed on window by content script
interface ViralCueExtension {
  isInstalled: true;
  version: string;
  status: "IDLE" | "CONNECTING" | "STREAMING" | "ERROR";
  activeStreamId: string | null;

  activate(config: {
    streamId: string;
    streamUrl: string;
    token: string;
  }): Promise<{ success: boolean; error?: string }>;

  deactivate(): Promise<void>;

  onStatusChange(callback: (status: Status) => void): () => void;
}

// Usage in Dashboard
if (window.viralcue?.isInstalled) {
  await window.viralcue.activate({ streamId, streamUrl, token });
}
```

---

### Phase 4: Backend Audio Capture (Paid Tier)

**Goal:** Serverless operation without browser extension

#### Backend Tasks

| Task                   | Files                       | Description               |
| ---------------------- | --------------------------- | ------------------------- |
| HLS stream fetcher     | `services/hls-capture/`     | Download audio from CDN   |
| Stream URL resolver    | `lib/twitch-hls.ts`         | Get HLS manifest URL      |
| Usage metering         | `lib/metering.ts`           | Track processing minutes  |
| Stripe integration     | `routes/billing.ts`         | Subscriptions, invoices   |
| Plan limits middleware | `middleware/plan-limits.ts` | Enforce tier restrictions |

#### Frontend Tasks

| Task            | Files                             | Description           |
| --------------- | --------------------------------- | --------------------- |
| Pricing page    | `app/pricing/`                    | Plan comparison       |
| Upgrade modal   | `components/upgrade-modal.tsx`    | Stripe checkout       |
| Usage dashboard | `app/dashboard/usage/`            | Minutes used, limits  |
| Plan management | `app/dashboard/settings/billing/` | Change plan, invoices |

#### Pricing Tiers

| Tier           | Price  | Stream Hours  | Features                      |
| -------------- | ------ | ------------- | ----------------------------- |
| **Free**       | $0     | 5 hrs/month   | Extension only, 1 platform    |
| **Creator**    | $19/mo | 30 hrs/month  | Extension only, all platforms |
| **Pro**        | $49/mo | 100 hrs/month | Backend capture, priority AI  |
| **Enterprise** | Custom | Unlimited     | Custom models, API access     |

---

### Phase 5: Platform Expansion

**Goal:** YouTube, Twitter/X support

#### YouTube Integration

| Task                      | Description                             | Complexity |
| ------------------------- | --------------------------------------- | ---------- |
| OAuth with YouTube scopes | `youtube.readonly`, `youtube.force-ssl` | Medium     |
| Live broadcast detection  | YouTube Data API v3                     | Medium     |
| Chat integration          | YouTube Live Streaming API              | High       |
| Quota management          | 10,000 units/day limit                  | High       |

#### Twitter/X Integration

| Task                    | Description          | Complexity |
| ----------------------- | -------------------- | ---------- |
| OAuth 2.0 PKCE          | Twitter API v2       | Medium     |
| Spaces detection        | Spaces endpoints     | Medium     |
| Auto-posting (optional) | Post tweets directly | Medium     |

---

## Part 4: Security & Compliance

### Authentication Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: IDENTITY (AWS Cognito)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ • User Pool with email/password + OAuth federation                          │
│ • JWT tokens (access: 1hr, refresh: 30 days)                                │
│ • MFA optional for high-value accounts                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: PLATFORM AUTHORIZATION                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ • OAuth tokens per connected platform                                       │
│ • Encrypted at rest (AES-256-GCM)                                           │
│ • Refresh tokens rotated on each use                                        │
│ • Scopes limited to minimum required                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: RESOURCE AUTHORIZATION                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Stream ownership validated server-side on every request                   │
│ • No client-side checks are trusted                                         │
│ • Audit log of all sensitive operations                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Compliance Requirements

| Requirement     | Implementation                                     |
| --------------- | -------------------------------------------------- |
| **GDPR**        | Data export, deletion on request, consent tracking |
| **Twitch ToS**  | Only process user's own streams, no bot behavior   |
| **YouTube ToS** | Quota compliance, no storage of video content      |
| **CCPA**        | Do-not-sell toggle, data disclosure                |
| **SOC 2**       | Audit logs, access controls, encryption            |

### Rate Limiting

```typescript
// Per endpoint limits
const rateLimits = {
  "/api/auth/*": { window: "1m", max: 10 },
  "/api/drafts": { window: "1m", max: 60 },
  "/api/streams": { window: "1m", max: 30 },
  "/ws/audio": { window: "1s", max: 4 }, // 4 chunks/sec
};
```

---

## Part 5: Environment & Configuration

### Development Environment

```bash
# Authentication
NEXT_PUBLIC_COGNITO_USER_POOL_ID=
NEXT_PUBLIC_COGNITO_CLIENT_ID=
NEXT_PUBLIC_COGNITO_DOMAIN=
COGNITO_USER_POOL_ID=

# Twitch (fallback OAuth + API)
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=http://localhost:3001/api/auth/callback/twitch

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# AI Services
DEEPGRAM_API_KEY=

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/viralcue
REDIS_URL=redis://localhost:6379

# Encryption
TOKEN_ENCRYPTION_KEY=  # 32-byte hex string

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

### Production Environment Differences

| Config        | Development      | Production          |
| ------------- | ---------------- | ------------------- |
| Database      | Local PostgreSQL | Aurora PostgreSQL   |
| Cache         | Local Redis      | ElastiCache         |
| AWS Resources | LocalStack       | Real AWS            |
| Auth          | Direct OAuth     | Cognito federated   |
| Logs          | Console          | CloudWatch          |
| Secrets       | .env file        | AWS Secrets Manager |

---

## Part 6: Success Metrics

### Technical Metrics

| Metric                 | Target (MVP) | Target (Scale) |
| ---------------------- | ------------ | -------------- |
| Audio → Draft latency  | < 30 seconds | < 15 seconds   |
| WebSocket reliability  | 99% uptime   | 99.9% uptime   |
| API response time      | < 200ms p95  | < 100ms p95    |
| Extension memory usage | < 100MB      | < 50MB         |

### Business Metrics

| Metric                 | Target                          |
| ---------------------- | ------------------------------- |
| Draft approval rate    | > 60%                           |
| Daily active streamers | 100 (Month 1) → 1,000 (Month 6) |
| Paid conversion rate   | > 5%                            |
| Monthly churn          | < 10%                           |

---

## Appendix: API Reference

### Authentication

```
GET  /api/auth/login              → Redirect to OAuth
GET  /api/auth/callback/twitch    → OAuth callback handler
GET  /api/auth/me                 → Get authenticated user
POST /api/auth/logout             → Invalidate session
POST /api/auth/refresh            → Refresh access token
```

### Platform Connections

```
GET    /api/connections                    → List all connections
POST   /api/connections/:platform/connect  → Initiate OAuth
DELETE /api/connections/:platform          → Revoke connection
GET    /api/connections/:platform/status   → Check token validity
```

### Streams

```
GET  /api/streams                 → List user's active streams
GET  /api/streams/:id             → Get stream details
POST /api/streams/:id/activate    → Start monitoring
POST /api/streams/:id/deactivate  → Stop monitoring
```

### Drafts

```
GET   /api/drafts                 → List drafts (paginated)
GET   /api/drafts/:id             → Get single draft
PATCH /api/drafts/:id             → Update (approve/reject/edit)
GET   /api/drafts/stats           → Approval stats
```

### Affiliate Links

```
GET    /api/affiliate-links       → List links
POST   /api/affiliate-links       → Create link
PATCH  /api/affiliate-links/:id   → Update link
DELETE /api/affiliate-links/:id   → Delete link
```

### WebSocket

```
WS /ws/audio
  Query: streamId, token

  Client → Server:
    { type: "AUDIO", data: base64, ts: number }
    { type: "HEARTBEAT" }

  Server → Client:
    { type: "CONNECTED", sessionId: string }
    { type: "DRAFT", draft: Draft }
    { type: "ERROR", code: string, message: string }
```
