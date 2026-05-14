# Phase 1: Core MVP - Implementation Status

## Overview

**Goal:** Complete end-to-end flow for a single Twitch user to capture stream audio, generate AI drafts, and approve them via the dashboard.

**Timeline:** 2-3 weeks

**Success Criteria:**

- User can login with Twitch ✅
- User can start audio capture from their live stream ⚠️ (needs extension work)
- AI generates draft posts in real-time ⚠️ (pipeline not wired)
- User can approve/reject drafts via swipe interface ✅
- All data flows through API (no direct DB access) ✅

---

## Current Status

| Component                        | Status        | Notes                                                |
| -------------------------------- | ------------- | ---------------------------------------------------- |
| Monorepo setup                   | ✅ Complete   | Turborepo + pnpm                                     |
| Database schema                  | ✅ Complete   | Prisma with User, Draft, Session, PlatformConnection |
| API server                       | ✅ Complete   | Express.js with routes + Socket.IO                   |
| Audio processor                  | ⚠️ Scaffolded | Python + Deepgram (files exist, not wired)           |
| AI engine                        | ⚠️ Scaffolded | Python + Bedrock (files exist, not wired)            |
| Browser extension                | ⚠️ Partial    | Plasmo framework, needs audio capture                |
| Dashboard UI                     | ✅ Complete   | Next.js 16 + Tailwind                                |
| **Auth (Clerk)**                 | ✅ Complete   | Migrated from Cognito to Clerk with session sync     |
| **Stream ownership validation**  | ✅ Complete   | `stream-auth.ts` middleware                          |
| **Extension ↔ Dashboard bridge** | ✅ Complete   | CustomEvent pattern                                  |
| **Dashboard WebSocket**          | ✅ Complete   | Socket.IO with Clerk auth                            |
| **End-to-end integration**       | 🔲 TODO       | Connect all pieces                                   |

---

## What's Implemented

### ✅ Authentication (Clerk Migration)

**Original Plan:** AWS Cognito with OAuth fallback
**Actual:** Clerk with official session sync

| File                                        | Purpose                                       |
| ------------------------------------------- | --------------------------------------------- |
| `apps/web/src/proxy.ts`                     | Clerk middleware protecting /dashboard routes |
| `services/api/src/middleware/clerk-auth.ts` | JWT verification via `authenticateRequest()`  |
| `apps/extension/src/popup.tsx`              | ClerkProvider with `syncHost`                 |

### ✅ Stream Ownership Validation

**File:** `services/api/src/middleware/stream-auth.ts`

- Validates user owns the stream via Twitch API
- Checks `platformConnection.platformUserId === stream.user_id`
- Returns 403 if user tries to access others' streams

### ✅ Real-Time Communication (Socket.IO)

**Original Plan:** Raw `ws` WebSocket
**Actual:** Socket.IO with rooms

| File                                         | Path                   | Purpose               |
| -------------------------------------------- | ---------------------- | --------------------- |
| `services/api/src/websocket/dashboard.ts`    | `/socket.io/dashboard` | Draft updates, status |
| `services/api/src/websocket/audio.ts`        | `/socket.io/audio`     | Audio streaming       |
| `apps/web/src/hooks/use-dashboard-socket.ts` | -                      | Frontend client       |

### ✅ Extension Detection Bridge

**Original Plan:** Script injection + `window.viralcue`
**Actual:** CustomEvent pattern (CSP-compatible)

| File                                  | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `apps/extension/src/content.tsx`      | Listens for `viralcue-ping`, responds via postMessage |
| `apps/web/src/hooks/use-extension.ts` | Detects extension, handles status                     |

---

## What's Missing / TODO

### ✅ Server-Side Audio Capture (HLS Fetcher)

**Architecture Change:** Replaced extension-based audio capture with server-side HLS fetching.

**Implemented:**

- `services/hls-fetcher/` - Python service for Twitch HLS streams
- Gets HLS URL via Twitch GQL API
- Streams to Deepgram for transcription
- Callbacks to API with transcripts

**Files:**

- `src/twitch_hls.py` - Playback token + HLS URL
- `src/audio_stream.py` - Segment streaming + FFmpeg
- `src/deepgram_client.py` - WebSocket transcription
- `src/main.py` - Job management (port 3003)

### 🔲 Wire Transcripts to AI Engine

**Problem:** HLS Fetcher sends transcripts to `/internal/transcripts` but AI Engine not receiving.

**Needs:**

- Forward transcripts from API to AI Engine
- AI Engine to generate drafts and push to dashboard

### 🔲 Token Encryption

**Problem:** Platform OAuth tokens stored in plain text.

**Needs:**

- AES-256-GCM encryption for `accessToken` and `refreshToken`
- `packages/db/src/crypto.ts` utility

### 🔲 Rate Limiting

**Problem:** No rate limiting on API endpoints.

**Needs:**

- `express-rate-limit` middleware
- Per-route limits as specified in suggested-plan.md

---

## File Reference

### Backend (services/api/src/)

```
middleware/
├── clerk-auth.ts          ✅ Clerk JWT verification
├── stream-auth.ts         ✅ Stream ownership validation
└── error-handler.ts       ✅ Error handling

routes/
├── auth.ts                ✅ Twitch OAuth, /me endpoint
├── streams.ts             ✅ List, activate, deactivate
├── drafts.ts              ✅ CRUD, approve/reject
├── affiliate-links.ts     ✅ CRUD
├── sessions.ts            ✅ Streaming sessions
├── user.ts                ✅ User profile
├── health.ts              ✅ Health check
└── internal.ts            ✅ Internal endpoints for AI engine

websocket/
├── dashboard.ts           ✅ Socket.IO with Clerk auth
└── audio.ts               ✅ Socket.IO for audio
```

### Frontend (apps/web/src/)

```
hooks/
├── use-dashboard-socket.ts  ✅ Socket.IO client
├── use-extension.ts         ✅ Extension detection
└── use-auth-fetch.ts        ✅ Authenticated fetch

app/
├── dashboard/
│   ├── page.tsx             ✅ Dashboard home
│   ├── live/page.tsx        ✅ Swipe interface
│   ├── streams/page.tsx     ✅ Stream selection
│   └── settings/page.tsx    ✅ Settings
└── login/page.tsx           ✅ Clerk SignIn
```

### Extension (apps/extension/src/)

```
popup.tsx      ✅ Clerk-integrated popup
content.tsx    ✅ CustomEvent detection bridge
background.ts  🔲 MISSING - needs tabCapture
```

---

## Testing Checklist

- [x] User can login with Twitch (via Clerk)
- [x] Extension is detected by dashboard
- [x] User can see when extension is installed/not installed
- [x] Stream ownership is validated server-side
- [x] Dashboard receives real-time updates via Socket.IO
- [ ] User can activate extension for a stream
- [ ] Audio flows from extension → API
- [ ] Transcription happens in real-time
- [ ] AI generates drafts when viral moment detected
- [ ] Drafts appear in dashboard immediately
- [x] User can swipe to approve/reject
- [x] Rejected streams show error if not owned by user

---

## Architecture Changes from Original Plan

| Component           | Original Plan        | Current Implementation | Reason                               |
| ------------------- | -------------------- | ---------------------- | ------------------------------------ |
| Auth                | AWS Cognito          | Clerk                  | Better DX, extension SDK             |
| WebSocket           | Raw `ws`             | Socket.IO              | Reconnection, rooms, auth middleware |
| Extension Framework | Vanilla JS           | Plasmo + React         | HMR, TypeScript, easier dev          |
| Extension Bridge    | Script injection     | CustomEvent            | CSP compatibility                    |
| Extension Auth      | Custom token passing | Clerk session sync     | Official support                     |

---

## Priority for Completion

1. **Add extension background.ts** - Enable audio capture
2. **Wire audio pipeline** - Connect to Deepgram directly or via services
3. **Add token encryption** - Security requirement
4. **Test end-to-end flow** - Login → Capture → Draft → Approve
