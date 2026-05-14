# Socket.IO Architecture

This document describes the real-time communication architecture using Socket.IO.

## Overview

ViralCue uses **Socket.IO** for real-time communication between the frontend and backend.

| Namespace | Path                   | Purpose                                        |
| --------- | ---------------------- | ---------------------------------------------- |
| Dashboard | `/socket.io/dashboard` | Draft updates, extension status, stream events |
| Audio     | `/socket.io/audio`     | Audio streaming from extension                 |

## Dashboard Socket

### Connection (Frontend)

```typescript
import { io } from "socket.io-client";

const socket = io("http://localhost:3001", {
  path: "/socket.io/dashboard",
  auth: { token: clerkToken },
});
```

### Authentication

1. Client sends Clerk JWT in `auth.token`
2. Server middleware verifies with `clerkClient.authenticateRequest()`
3. User joins room `user:{userId}`

### Events

| Event              | Direction       | Description                      |
| ------------------ | --------------- | -------------------------------- |
| `connected`        | Server → Client | Connection confirmed with userId |
| `draft:new`        | Server → Client | New draft generated              |
| `draft:update`     | Server → Client | Draft status changed             |
| `extension:status` | Server → Client | Extension status update          |
| `stream:status`    | Server → Client | Stream status change             |
| `ping` / `pong`    | Bidirectional   | Heartbeat                        |

## Audio Socket

### Connection (Extension)

```typescript
const socket = io("http://localhost:3001", {
  path: "/socket.io/audio",
  auth: { userId: "..." },
});
```

### Events

| Event        | Direction       | Description                |
| ------------ | --------------- | -------------------------- |
| `connected`  | Server → Client | Session ID assigned        |
| `audio:data` | Client → Server | Audio chunk (Buffer)       |
| `draft`      | Server → Client | Generated draft from audio |

## Benefits of Socket.IO

- **Automatic reconnection** with configurable attempts
- **Room-based messaging** for user-specific events
- **Transport fallback** (WebSocket → Polling)
- **Auth middleware** for clean token verification
