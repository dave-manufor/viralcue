# Extension ↔ Web App Communication Flow

This document describes how the ViralCue Chrome extension communicates with the web app and authenticates with the API.

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   ViralCue Web App  │     │  Chrome Extension   │     │    Backend API      │
│   (localhost:3000)  │     │      (Plasmo)       │     │  (localhost:3001)   │
└──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘
           │                           │                           │
           │    Session Sync via Clerk │                           │
           │◄─────────────────────────►│                           │
           │       (syncHost)          │                           │
           │                           │                           │
           │                           │   API Calls with Token    │
           │                           │──────────────────────────►│
           │                           │                           │
```

## Session Sync (Clerk)

The extension uses Clerk's **session sync** feature instead of custom token passing.

### How It Works

1. User logs into the web app via Clerk
2. Clerk sets session cookies on the domain
3. Extension reads session from webapp via `syncHost` prop
4. Extension is automatically authenticated when webapp is logged in

### Configuration

```tsx
// Extension ClerkProvider
<ClerkProvider
  publishableKey={PUBLISHABLE_KEY}
  syncHost="http://localhost:3000"  // webapp URL
>
```

## Extension Detection (Dashboard)

The dashboard detects extension installation via CustomEvent:

### Dashboard (sender)

```js
window.dispatchEvent(new CustomEvent("viralcue-ping"));
window.addEventListener("message", (e) => {
  if (e.data.type === "VIRALCUE_INSTALLED") {
    // Extension is installed
  }
});
```

### Extension Content Script (responder)

```js
window.addEventListener("viralcue-ping", () => {
  window.postMessage({ type: "VIRALCUE_INSTALLED", version: "0.1.0" });
});
```

## API Authentication

When the extension needs to call the API:

1. Get Clerk token: `await clerk.session?.getToken()`
2. Include in request: `Authorization: Bearer <token>`
3. API verifies token via Clerk SDK

## Streaming Sites

The extension also injects into streaming sites (Twitch, YouTube, Kick) to detect stream context and capture audio.
