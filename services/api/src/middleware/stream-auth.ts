import { Request, Response, NextFunction } from "express";
import { prisma } from "@viralcue/db";
import { AuthenticatedRequest as ClerkAuthenticatedRequest } from "./clerk-auth";
import { decrypt, encrypt } from "../lib/crypto";
import { redis } from "../lib/redis";

// Twitch API configuration
const TWITCH_API_URL = "https://api.twitch.tv/helix";
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";

interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
}

export interface AuthenticatedRequest extends ClerkAuthenticatedRequest {
  stream?: TwitchStream;
  platformConnection?: {
    id: string;
    platform: string;
    platformUserId: string;
    accessToken: string;
  };
}

/**
 * Fetch the user's current stream from Twitch API
 * We query by user_id (the Twitch user) and verify the stream ID matches
 */
async function getUserTwitchStream(
  streamId: string,
  twitchUserId: string,
  accessToken: string
): Promise<TwitchStream | null> {
  try {
    // Query streams by the user's Twitch ID, not by stream ID
    // This ensures we're only looking at this user's streams
    const response = await fetch(
      `${TWITCH_API_URL}/streams?user_id=${twitchUserId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": TWITCH_CLIENT_ID,
        },
      }
    );

    if (!response.ok) {
      console.error("[Twitch] API error:", response.status);
      return null;
    }

    const data = await response.json();
    const stream = data.data?.[0];

    if (!stream) {
      console.log("[Twitch] User is not currently live");
      return null;
    }

    // Verify the stream ID matches what the user is trying to activate
    if (stream.id !== streamId) {
      console.warn(
        `[Twitch] Stream ID mismatch: requested ${streamId}, user has ${stream.id}`
      );
      return null;
    }

    return stream;
  } catch (error) {
    console.error("[Twitch] Failed to fetch stream:", error);
    return null;
  }
}

/**
 * Middleware to validate that the authenticated user owns the stream
 * they are trying to access. This is critical for legal compliance.
 *
 * Requires clerkAuth middleware to run first (which resolves req.userId)
 */
export async function validateStreamOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const userId = req.userId;
  const streamId = req.params.streamId || (req.query.streamId as string);

  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!streamId) {
    return res.status(400).json({ error: "Stream ID required" });
  }

  const cacheKey = `viralcue:stream-ownership:${userId}:${streamId}`;

  try {
    // Check Redis Cache
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        req.stream = parsed.stream;
        req.platformConnection = parsed.platformConnection;
        return next();
      } catch (err) {
        console.warn("[Stream Auth] Failed to parse cached data, falling back to live verification:", err);
      }
    }

    // Check for Twitch connection
    const twitchConnection = await prisma.connection.findFirst({
      where: { userId, provider: "TWITCH" },
    });

    if (twitchConnection) {
      const decryptedAccessToken = decrypt(twitchConnection.accessToken)!;
      // Try Twitch verification
      const stream = await getUserTwitchStream(
        streamId,
        twitchConnection.platformUserId,
        decryptedAccessToken
      );

      if (stream) {
        req.stream = stream;
        req.platformConnection = {
          id: twitchConnection.id,
          platform: "TWITCH",
          platformUserId: twitchConnection.platformUserId,
          accessToken: decryptedAccessToken,
        };
        // Cache result in Redis (5-minute TTL)
        await redis.set(
          cacheKey,
          JSON.stringify({
            stream,
            platformConnection: req.platformConnection,
          }),
          "EX",
          300
        );
        return next();
      }
    }

    // Check for Kick connection
    const kickConnection = await prisma.connection.findFirst({
      where: { userId, provider: "KICK" },
    });

    if (kickConnection) {
      const decryptedAccessToken = decrypt(kickConnection.accessToken)!;
      // Try Kick verification
      const stream = await getUserKickStream(
        streamId,
        userId,
        decryptedAccessToken
      );

      if (stream) {
        req.stream = stream; // Shape matches TwitchStream interface roughly or we need to generalize it
        req.platformConnection = {
          id: kickConnection.id,
          platform: "KICK",
          platformUserId: kickConnection.platformUserId,
          accessToken: decryptedAccessToken,
        };
        // Cache result in Redis (5-minute TTL)
        await redis.set(
          cacheKey,
          JSON.stringify({
            stream,
            platformConnection: req.platformConnection,
          }),
          "EX",
          300
        );
        return next();
      }
    }

    // If neither found
    return res.status(404).json({
      error: "Stream not found or not your stream",
      code: "STREAM_NOT_FOUND",
    });
  } catch (error) {
    console.error("Stream ownership validation error:", error);
    return res.status(500).json({
      error: "Failed to validate stream ownership",
      code: "VALIDATION_ERROR",
    });
  }
}

/**
 * Refresh Twitch access token using refresh token
 * Per Twitch docs: Refresh tokens for Confidential Clients (server-side) DO NOT expire
 */
async function refreshTwitchToken(
  connectionId: string,
  refreshToken: string
): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID || "";
  const clientSecret = process.env.TWITCH_CLIENT_SECRET || "";

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Twitch] Token refresh failed:", errorText);
      return null;
    }

    const tokens = await response.json();

    // CRITICAL: Always save the new refresh token (Twitch may issue a new one)
    await prisma.connection.update({
      where: { id: connectionId },
      data: {
        accessToken: encrypt(tokens.access_token)!,
        refreshToken: encrypt(tokens.refresh_token || refreshToken), // Keep old if not provided
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    console.log("[Twitch] Token refreshed successfully");
    return tokens.access_token;
  } catch (error) {
    console.error("[Twitch] Token refresh error:", error);
    return null;
  }
}

/**
 * Make a Twitch API call with reactive 401 handling
 * Per Twitch best practices: Handle 401 by refreshing token and retrying
 */
async function twitchApiCall(
  url: string,
  connection: { id: string; accessToken: string; refreshToken: string | null }
): Promise<{ data: any; newAccessToken?: string } | null> {
  const clientId = process.env.TWITCH_CLIENT_ID || "";
  const decryptedAccessToken = decrypt(connection.accessToken)!;
  const decryptedRefreshToken = decrypt(connection.refreshToken);

  // First attempt
  let response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${decryptedAccessToken}`,
      "Client-Id": clientId,
    },
  });

  // If 401, try refreshing token and retry once
  if (response.status === 401 && decryptedRefreshToken) {
    console.log("[Twitch] Got 401, attempting token refresh...");

    const newToken = await refreshTwitchToken(
      connection.id,
      decryptedRefreshToken
    );

    if (newToken) {
      // Retry with new token
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${newToken}`,
          "Client-Id": clientId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return { data, newAccessToken: newToken };
      }
    }

    console.error("[Twitch] Token refresh failed or retry failed");
    return null;
  }

  if (!response.ok) {
    console.error(
      "[Twitch] API error:",
      response.status,
      await response.text()
    );
    return null;
  }

  const data = await response.json();
  return { data };
}

/**
 * Fetch the user's current stream from Kick API
 * Uses the authenticated /public/v1/channels endpoint which returns the current user's channel
 */
async function getUserKickStream(
  streamId: string, // Kick uses channel slug as ID
  userId: string, // Internal DB user ID
  token: string
): Promise<any | null> {
  try {
    // Use GET /public/v1/channels with no params - returns authenticated user's channel info
    const channelRes = await fetch("https://api.kick.com/public/v1/channels", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!channelRes.ok) {
      console.error("[Kick] Failed to fetch channel:", channelRes.status);
      return null;
    }

    const response = await channelRes.json();
    const channelInfo = response.data?.[0];

    if (!channelInfo) {
      console.error("[Kick] No channel found for authenticated user");
      return null;
    }

    // Verify ownership: the streamId should match the authenticated user's channel slug
    if (channelInfo.slug?.toLowerCase() !== streamId.toLowerCase()) {
      console.warn(
        `[Kick] Channel slug mismatch: requested ${streamId}, user has ${channelInfo.slug}`
      );
      return null;
    }

    // Check if live
    if (!channelInfo.stream?.is_live) {
      console.log("[Kick] Channel is offline");
      return null;
    }

    const stream = channelInfo.stream;
    return {
      id: channelInfo.slug,
      user_id: String(channelInfo.broadcaster_user_id),
      user_login: channelInfo.slug,
      user_name: channelInfo.slug,
      game_name: channelInfo.category?.name || "Unknown",
      type: "live",
      title: channelInfo.stream_title || "Live Stream",
      viewer_count: stream.viewer_count || 0,
      started_at: stream.start_time,
      thumbnail_url: stream.thumbnail,
    };
  } catch (error) {
    console.error("[Kick] Failed to fetch stream:", error);
    return null;
  }
}

/**
 * Get user's active streams from connected platforms
 * One-time Twitch setup - tokens auto-refresh when needed
 */
export async function getUserActiveStreams(userId: string) {
  const streams = [];

  // TWITCH
  const twitchConnection = await prisma.connection.findFirst({
    where: { userId, provider: "TWITCH" },
  });

  if (twitchConnection) {
    try {
      const result = await twitchApiCall(
        `${TWITCH_API_URL}/streams?user_id=${twitchConnection.platformUserId}`,
        {
          id: twitchConnection.id,
          accessToken: twitchConnection.accessToken,
          refreshToken: twitchConnection.refreshToken,
        }
      );
      if (result?.data?.data) {
        streams.push(...result.data.data);
      }
    } catch (error) {
      console.error("[Twitch] Failed to fetch user streams:", error);
    }
  }

  // KICK
  const kickConnection = await prisma.connection.findFirst({
    where: { userId, provider: "KICK" },
  });

  if (kickConnection) {
    try {
      const token = decrypt(kickConnection.accessToken)!;

      // According to Kick docs: GET /public/v1/channels with NO params returns
      // the channel info for the currently authenticated user, including stream status
      const channelRes = await fetch(
        "https://api.kick.com/public/v1/channels",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log("[Kick Debug] /channels response status:", channelRes.status);

      if (channelRes.ok) {
        const response = await channelRes.json();
        console.log(
          "[Kick Debug] /channels response:",
          JSON.stringify(response).slice(0, 800)
        );

        // Response structure: { data: [{ slug, stream: { is_live, ... }, stream_title, ... }] }
        const channelInfo = response.data?.[0];

        if (channelInfo && channelInfo.stream?.is_live) {
          const stream = channelInfo.stream;
          streams.push({
            id: channelInfo.slug,
            user_id: String(channelInfo.broadcaster_user_id),
            user_login: channelInfo.slug,
            user_name: channelInfo.slug,
            game_name: channelInfo.category?.name || "Unknown",
            type: "live",
            title: channelInfo.stream_title || "Live Stream",
            viewer_count: stream.viewer_count || 0,
            started_at: stream.start_time,
            thumbnail_url: stream.thumbnail,
            platform: "KICK",
          });
          console.log("[Kick Debug] Found live stream, added to results");
        } else {
          console.log("[Kick Debug] Channel is not live or no channel found");
        }
      } else {
        const errorText = await channelRes.text();
        console.error(
          "[Kick] /channels fetch failed:",
          channelRes.status,
          errorText
        );
      }
    } catch (err) {
      console.error("[Kick] Failed to fetch streams:", err);
    }
  }

  return streams;
}

// Update validateStreamOwnership to handle Kick
// ... (We need to update the big function body separately or replace it completely)
