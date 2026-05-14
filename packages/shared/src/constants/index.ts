// ============================================
// SUBSCRIPTION TIERS
// ============================================

export const SUBSCRIPTION_LIMITS = {
  FREE: {
    streamingHours: 1,
    priceMonthly: 0,
    features: ["Basic viral detection", "Copy-to-clipboard tweets"],
  },
  STARTER: {
    streamingHours: 15,
    priceMonthly: 29,
    overagePerBlock: 3, // per 5-hour block
    features: [
      "15 hours/month",
      "Viral moment detection",
      "Tweet drafts",
      "Twitch chat injection",
      "Affiliate link matching",
    ],
  },
  PRO: {
    streamingHours: 60,
    priceMonthly: 79,
    overagePerBlock: 3,
    features: [
      "60 hours/month",
      "All Starter features",
      "Priority processing",
      "Advanced analytics",
    ],
  },
  AGENCY: {
    streamingHours: 300,
    priceMonthly: 299,
    overagePerBlock: 2,
    features: [
      "300 hours/month",
      "All Pro features",
      "Multiple channels",
      "Priority support",
    ],
  },
} as const;

// ============================================
// API ENDPOINTS
// ============================================

export const API_ROUTES = {
  // Auth
  AUTH_LOGIN: "/api/auth/login",
  AUTH_LOGOUT: "/api/auth/logout",
  AUTH_CALLBACK_TWITCH: "/api/auth/callback/twitch",
  
  // User
  USER_ME: "/api/user/me",
  USER_SUBSCRIPTION: "/api/user/subscription",
  
  // Sessions
  SESSIONS: "/api/sessions",
  SESSION_START: "/api/sessions/start",
  SESSION_END: "/api/sessions/:id/end",
  
  // Drafts
  DRAFTS: "/api/drafts",
  DRAFT_ACTION: "/api/drafts/:id/action",
  
  // Affiliate Links
  AFFILIATE_LINKS: "/api/affiliate-links",
  AFFILIATE_LINK: "/api/affiliate-links/:id",
  
  // WebSocket
  WS_AUDIO: "/ws/audio",
  WS_DRAFTS: "/ws/drafts",
} as const;

// ============================================
// RATE LIMITS
// ============================================

export const RATE_LIMITS = {
  API_REQUESTS_PER_MINUTE: 60,
  DRAFT_ACTIONS_PER_MINUTE: 30,
  AFFILIATE_CREATES_PER_HOUR: 50,
} as const;

// ============================================
// DRAFT CONSTANTS
// ============================================

export const DRAFT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_TWEET_LENGTH = 280;
export const MAX_CHAT_MESSAGE_LENGTH = 500;

// ============================================
// TWITCH
// ============================================

export const TWITCH_SCOPES = [
  "user:read:email",
  "chat:edit",
  "chat:read",
] as const;
