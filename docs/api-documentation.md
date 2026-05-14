# ViralCue API Documentation

## Base URL

- **Local:** `http://localhost:8000`
- **Production:** `https://api.viralcue.com`

## Authentication

All endpoints require a valid Clerk JWT token in the `Authorization` header:

```
Authorization: Bearer <clerk_token>
```

---

## Endpoints

### Streams

#### Start Monitoring a Stream

```http
POST /api/streams/monitor
```

**Request Body:**

```json
{
  "platform": "twitch",
  "channelName": "streamername",
  "features": {
    "viralDetection": true,
    "affiliateKeywords": ["keyboard", "mouse"]
  }
}
```

**Response:**

```json
{
  "streamId": "stream_abc123",
  "status": "monitoring",
  "startedAt": "2024-01-01T00:00:00Z"
}
```

#### Stop Monitoring

```http
DELETE /api/streams/:streamId
```

---

### Cards (Drafts)

#### Get Pending Cards

```http
GET /api/cards?status=pending
```

**Response:**

```json
{
  "cards": [
    {
      "id": "card_xyz789",
      "streamId": "stream_abc123",
      "status": "pending",
      "viralScore": 85,
      "videoUrl": "https://storage.googleapis.com/...",
      "thumbnailUrl": "https://storage.googleapis.com/...",
      "aiAnalysis": {
        "reasoning": "Epic clutch play with high chat reaction",
        "category": "Clutch",
        "momentDescription": "1v5 ace in final round"
      },
      "draftPosts": {
        "twitter": { "text": "That was INSANE! 🔥 #gaming" },
        "tiktok": {
          "caption": "Wait for it... 😱",
          "hashtags": ["gaming", "clutch"]
        }
      },
      "createdAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### Approve Card

```http
POST /api/cards/:cardId/approve
```

**Request Body:**

```json
{
  "platforms": ["twitter", "tiktok"],
  "edits": {
    "twitter": { "text": "Custom edited tweet text" }
  }
}
```

#### Reject Card

```http
POST /api/cards/:cardId/reject
```

---

### Affiliate Links

#### List Affiliate Links

```http
GET /api/affiliate-links
```

#### Create Affiliate Link

```http
POST /api/affiliate-links
```

**Request Body:**

```json
{
  "platform": "amazon",
  "keyword": "razer mouse",
  "baseUrl": "https://amazon.com/dp/B123456",
  "trackingTag": "viralcue-20"
}
```

---

### User Settings

#### Get Settings

```http
GET /api/settings
```

#### Update Persona

```http
PATCH /api/settings/persona
```

**Request Body:**

```json
{
  "displayName": "MyStreamerName",
  "personaTags": ["Sarcastic", "High Skill", "FPS Player"]
}
```

---

## WebSocket Events

Connect to `/` with Socket.IO for real-time updates.

### Events (Server → Client)

| Event           | Payload              | Description              |
| --------------- | -------------------- | ------------------------ |
| `draft:new`     | `CardDocument`       | New card created         |
| `draft:updated` | `{id, status}`       | Card status changed      |
| `stream:status` | `{streamId, status}` | Stream monitoring status |

### Events (Client → Server)

| Event        | Payload    | Description               |
| ------------ | ---------- | ------------------------- |
| `join:user`  | `{userId}` | Subscribe to user updates |
| `leave:user` | `{userId}` | Unsubscribe               |

---

## Pub/Sub Topics

| Topic                        | Publisher      | Subscriber        |
| ---------------------------- | -------------- | ----------------- |
| `viralcue-viral-candidates`  | stream-monitor | clip-fetcher      |
| `viralcue-clip-downloaded`   | clip-fetcher   | ai-engine         |
| `viralcue-drafts`            | ai-engine      | API               |
| `viralcue-card-approved`     | API            | publisher-webhook |
| `viralcue-affiliate-trigger` | stream-monitor | affiliate-trigger |

---

## Error Responses

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

| Code             | HTTP Status | Description              |
| ---------------- | ----------- | ------------------------ |
| `UNAUTHORIZED`   | 401         | Invalid auth token       |
| `FORBIDDEN`      | 403         | Insufficient permissions |
| `NOT_FOUND`      | 404         | Resource not found       |
| `RATE_LIMITED`   | 429         | Too many requests        |
| `INTERNAL_ERROR` | 500         | Server error             |
