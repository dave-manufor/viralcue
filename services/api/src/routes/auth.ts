import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import {
  clerkAuth,
  getOrCreateUser,
  AuthenticatedRequest,
} from "../middleware/clerk-auth";

export const authRouter: RouterType = Router();

// Twitch OAuth configuration (for platform connection, not auth)
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
const TWITCH_REDIRECT_URI =
  process.env.TWITCH_REDIRECT_URI ||
  "http://localhost:3001/api/auth/callback/twitch";

const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

const TWITCH_SCOPES = [
  "user:read:email",
  "user:read:broadcast",
  "chat:read",
  "chat:edit",
].join(" ");

// YouTube (Google) Configuration
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || "";
const YOUTUBE_REDIRECT_URI =
  process.env.YOUTUBE_REDIRECT_URI ||
  "http://localhost:3001/api/auth/callback/youtube";
const YOUTUBE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// Instagram (Direct Login API - launched July 2024)
// This allows users to log in directly with Instagram Business/Creator accounts
// without needing a Facebook account
const META_CLIENT_ID = process.env.META_CLIENT_ID || "";
const META_CLIENT_SECRET = process.env.META_CLIENT_SECRET || "";
const INSTAGRAM_REDIRECT_URI =
  process.env.INSTAGRAM_REDIRECT_URI ||
  "http://localhost:3001/api/auth/callback/instagram";
// Instagram Direct Login endpoints (not Facebook)
const INSTAGRAM_AUTH_URL = "https://api.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
// New scope names for Instagram API with Instagram Login (required after Jan 27, 2025)
const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
].join(","); // Instagram uses comma-separated scopes

// TikTok Configuration
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI =
  process.env.TIKTOK_REDIRECT_URI ||
  "http://localhost:3001/api/auth/callback/tiktok";
const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_SCOPES = ["user.info.basic", "video.publish"].join(",");

// Twitter (X) Configuration
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || "";
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || "";
const TWITTER_REDIRECT_URI =
  process.env.TWITTER_REDIRECT_URI ||
  "http://localhost:3001/api/auth/callback/twitter";
const TWITTER_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TWITTER_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
].join(" ");

// In-memory state store for OAuth CSRF protection
const pendingStates = new Map<
  string,
  { userId: string; provider: string; createdAt: number }
>();

/**
 * GET /api/auth/me - Get current user (authenticated via Clerk)
 */
authRouter.get(
  "/me",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);

      // Fetch user with subscription plan and settings
      const userWithPlan = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          subscriptionPlan: true,
          settings: {
            include: {
              contextVersions: { where: { isActive: true } },
            },
          },
        },
      });

      // Fetch connections with token health status
      const connections = await prisma.connection.findMany({
        where: { userId: user.id },
        select: {
          provider: true,
          platformUsername: true,
          connectedAt: true,
          expiresAt: true,
          refreshToken: true,
        },
      });

      // Add computed needsReconnect field
      const now = new Date();
      const connectionsWithHealth = connections.map(
        (c: {
          provider: string;
          platformUsername: string | null;
          connectedAt: Date;
          expiresAt: Date | null;
          refreshToken: string | null;
        }) => ({
          provider: c.provider,
          platformUsername: c.platformUsername,
          connectedAt: c.connectedAt,
          expiresAt: c.expiresAt,
          // Only needs reconnect if expired AND no refresh token available
          needsReconnect: c.expiresAt
            ? c.expiresAt < now && !c.refreshToken
            : false,
        })
      );

      res.json({
        id: user.id,
        clerkId: user.authProviderId,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        subscriptionTier: userWithPlan?.subscriptionPlan?.name || "free",
        // Context status for onboarding logic
        contextPromptDismissed:
          userWithPlan?.settings?.contextPromptDismissed || false,
        hasActiveContext:
          (userWithPlan?.settings?.contextVersions?.length || 0) > 0,
        connections: connectionsWithHealth,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// GENERIC OAUTH HANDLERS
// ==========================================

/**
 * Generate OAuth URL and redirect
 */
const getAuthUrl = async (
  userId: string,
  provider: string,
  authUrl: string,
  clientId: string,
  redirectUri: string,
  scope: string,
  extraParams: Record<string, string> = {}
) => {
  const state = crypto.randomUUID();
  pendingStates.set(state, { userId, provider, createdAt: Date.now() });

  // Cleanup old states
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of pendingStates.entries()) {
    if (value.createdAt < tenMinutesAgo) pendingStates.delete(key);
  }

  // TikTok uses 'client_key' instead of 'client_id'
  const clientIdParam = provider === "TIKTOK" ? "client_key" : "client_id";

  const params = new URLSearchParams({
    [clientIdParam]: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    ...extraParams,
  });

  return `${authUrl}?${params.toString()}`;
};

/**
 * Handle OAuth Callback and Token Exchange
 */
const handleCallback = async (
  req: any,
  res: any,
  providerConfig: {
    provider: "TWITCH" | "YOUTUBE" | "INSTAGRAM" | "TIKTOK" | "TWITTER";
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopeSeparator?: string;
  }
) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error(`${providerConfig.provider} OAuth error:`, error);
    return res.redirect(`http://localhost:3000/settings?error=oauth_denied`);
  }

  if (!code || !state) {
    return res.redirect(`http://localhost:3000/settings?error=missing_params`);
  }

  const stateData = pendingStates.get(state as string);
  if (!stateData || stateData.provider !== providerConfig.provider) {
    return res.redirect(`http://localhost:3000/settings?error=invalid_state`);
  }
  pendingStates.delete(state as string);

  try {
    // TikTok uses 'client_key' instead of 'client_id'
    const clientIdKey =
      providerConfig.provider === "TIKTOK" ? "client_key" : "client_id";

    const params = new URLSearchParams({
      [clientIdKey]: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      code: code as string,
      grant_type: "authorization_code",
      redirect_uri: providerConfig.redirectUri,
    });

    // Twitter/X requires Basic Auth header for token exchange
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (providerConfig.provider === "TWITTER") {
      const auth = Buffer.from(
        `${providerConfig.clientId}:${providerConfig.clientSecret}`
      ).toString("base64");
      headers["Authorization"] = `Basic ${auth}`;
      params.delete("client_secret"); // Don't send in body if using Basic Auth
      params.delete("client_id");
      // PKCE would be better but simple flow for now
      params.append("code_verifier", "challenge"); // Placeholder if strictly required, but usually needs real PKCE flow
    }

    const tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: "POST",
      headers,
      body: params,
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error(`${providerConfig.provider} token error:`, errText);
      throw new Error("Failed to exchange code for tokens");
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, open_id } = tokens;

    // Fetch User Info (Provider Specific)
    let platformUserId = "";
    let platformUsername = "";

    if (providerConfig.provider === "TWITCH") {
      const userRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Client-Id": providerConfig.clientId,
        },
      });
      const data = await userRes.json();
      platformUserId = data.data[0].id;
      platformUsername = data.data[0].display_name;
    } else if (providerConfig.provider === "YOUTUBE") {
      // Use OpenID Connect or UserInfo endpoint
      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );
      const data = await userRes.json();
      platformUserId = data.id;
      platformUsername = data.name || data.email;
    } else if (providerConfig.provider === "INSTAGRAM") {
      // Instagram Graph API (Direct Login)
      // Get Instagram Business Account info using the access token
      const userRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${access_token}`
      );
      const data = await userRes.json();
      platformUserId = data.user_id || data.id;
      platformUsername = data.username;
    } else if (providerConfig.provider === "TIKTOK") {
      // TikTok V2 User Info
      const userRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );
      const data = await userRes.json();
      const user = data.data.user;
      platformUserId = user.open_id; // Use OpenID
      platformUsername = user.display_name;
    } else if (providerConfig.provider === "TWITTER") {
      const userRes = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const data = await userRes.json();
      platformUserId = data.data.id;
      platformUsername = data.data.username;
    }

    // DB Upsert
    await prisma.connection.upsert({
      where: {
        userId_provider: {
          userId: stateData.userId,
          provider: providerConfig.provider,
        },
      },
      create: {
        userId: stateData.userId,
        provider: providerConfig.provider,
        platformUserId,
        platformUsername,
        accessToken: access_token,
        refreshToken: refresh_token, // May be null if not offline access
        scopes: [], // Simplify for now
        expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
      },
      update: {
        platformUserId,
        platformUsername,
        accessToken: access_token,
        refreshToken: refresh_token, // Only update if provided
        expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000),
      },
    });

    // Specific update for User model references (Legacy fields)
    if (providerConfig.provider === "TWITCH") {
      await prisma.user.update({
        where: { id: stateData.userId },
        data: { twitchId: platformUserId, twitchUsername: platformUsername },
      });
    }

    res.redirect(
      `http://localhost:3000/settings?success=${providerConfig.provider.toLowerCase()}_connected`
    );
  } catch (error) {
    console.error("Callback error:", error);
    res.redirect(`http://localhost:3000/settings?error=connection_failed`);
  }
};

// ==========================================
// ROUTES
// ==========================================

// TWITCH
authRouter.get(
  "/connect/twitch/url",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);
      const url = await getAuthUrl(
        user.id,
        "TWITCH",
        TWITCH_AUTH_URL,
        TWITCH_CLIENT_ID,
        TWITCH_REDIRECT_URI,
        TWITCH_SCOPES
      );
      res.json({ url });
    } catch (e) {
      next(e);
    }
  }
);
authRouter.get("/callback/twitch", (req, res) =>
  handleCallback(req, res, {
    provider: "TWITCH",
    tokenUrl: TWITCH_TOKEN_URL,
    clientId: TWITCH_CLIENT_ID,
    clientSecret: TWITCH_CLIENT_SECRET,
    redirectUri: TWITCH_REDIRECT_URI,
  })
);

// YOUTUBE
authRouter.get(
  "/connect/youtube/url",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);
      const url = await getAuthUrl(
        user.id,
        "YOUTUBE",
        YOUTUBE_AUTH_URL,
        YOUTUBE_CLIENT_ID,
        YOUTUBE_REDIRECT_URI,
        YOUTUBE_SCOPES,
        { access_type: "offline", prompt: "consent" }
      ); // Prompt for refresh token
      res.json({ url });
    } catch (e) {
      next(e);
    }
  }
);
authRouter.get("/callback/youtube", (req, res) =>
  handleCallback(req, res, {
    provider: "YOUTUBE",
    tokenUrl: YOUTUBE_TOKEN_URL,
    clientId: YOUTUBE_CLIENT_ID,
    clientSecret: YOUTUBE_CLIENT_SECRET,
    redirectUri: YOUTUBE_REDIRECT_URI,
  })
);

// INSTAGRAM
authRouter.get(
  "/connect/instagram/url",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);
      const url = await getAuthUrl(
        user.id,
        "INSTAGRAM",
        INSTAGRAM_AUTH_URL,
        META_CLIENT_ID,
        INSTAGRAM_REDIRECT_URI,
        INSTAGRAM_SCOPES
      );
      res.json({ url });
    } catch (e) {
      next(e);
    }
  }
);
authRouter.get("/callback/instagram", (req, res) =>
  handleCallback(req, res, {
    provider: "INSTAGRAM",
    tokenUrl: INSTAGRAM_TOKEN_URL,
    clientId: META_CLIENT_ID,
    clientSecret: META_CLIENT_SECRET,
    redirectUri: INSTAGRAM_REDIRECT_URI,
  })
);

// TIKTOK
authRouter.get(
  "/connect/tiktok/url",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);
      // TikTok requires code_challenge for PKCE usually, but using standard flow for now if allowed by App settings
      const url = await getAuthUrl(
        user.id,
        "TIKTOK",
        TIKTOK_AUTH_URL,
        TIKTOK_CLIENT_KEY,
        TIKTOK_REDIRECT_URI,
        TIKTOK_SCOPES
      );
      res.json({ url });
    } catch (e) {
      next(e);
    }
  }
);
authRouter.get("/callback/tiktok", (req, res) =>
  handleCallback(req, res, {
    provider: "TIKTOK",
    tokenUrl: TIKTOK_TOKEN_URL,
    clientId: TIKTOK_CLIENT_KEY,
    clientSecret: TIKTOK_CLIENT_SECRET,
    redirectUri: TIKTOK_REDIRECT_URI,
  })
);

// TWITTER
authRouter.get(
  "/connect/twitter/url",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);
      // PKCE params normally required: code_challenge, code_challenge_method
      // For implementation simplicity here we skip complex PKCE calc, assuming simple OAuth2 conf or library usage usually handles this.
      // However, Twitter API v2 STRICTLY requires PKCE.
      // We'll pass a fixed dummy challenge for now, but in prod use a library like `twitter-api-v2`.
      const url = await getAuthUrl(
        user.id,
        "TWITTER",
        TWITTER_AUTH_URL,
        TWITTER_CLIENT_ID,
        TWITTER_REDIRECT_URI,
        TWITTER_SCOPES,
        { code_challenge: "challenge", code_challenge_method: "plain" }
      );
      res.json({ url });
    } catch (e) {
      next(e);
    }
  }
);
authRouter.get("/callback/twitter", (req, res) =>
  handleCallback(req, res, {
    provider: "TWITTER",
    tokenUrl: TWITTER_TOKEN_URL,
    clientId: TWITTER_CLIENT_ID,
    clientSecret: TWITTER_CLIENT_SECRET,
    redirectUri: TWITTER_REDIRECT_URI,
  })
);

/**
 * DELETE /api/auth/disconnect/:provider
 */
authRouter.delete(
  "/disconnect/:provider",
  clerkAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await getOrCreateUser(req.clerkUserId!);
      const provider = req.params.provider.toUpperCase() as
        | "TWITCH"
        | "YOUTUBE"
        | "INSTAGRAM"
        | "TIKTOK"
        | "TWITTER";

      await prisma.connection.deleteMany({
        where: {
          userId: user.id,
          provider: provider as any,
        },
      });

      if (provider === "TWITCH") {
        await prisma.user.update({
          where: { id: user.id },
          data: { twitchId: null, twitchUsername: null },
        });
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);
