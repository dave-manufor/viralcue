import { Router } from "express";
import crypto from "crypto";
import { prisma } from "@viralcue/db";
import { kickAuth } from "../lib/kick-auth";
import { clerkAuth } from "../middleware/clerk-auth";
import { AuthenticatedRequest } from "../middleware/clerk-auth";
import { redis } from "../lib/redis";

export const kickAuthRouter: Router = Router();

// We need to store the codeVerifier between request and callback
// In a production app with multiple instances, use Redis.
// For MVP/single-instance, a memory map with short TTL is acceptable but risky.
// Better approach: Store in a secure httpOnly cookie.

/**
 * POST /api/auth/kick/ticket
 * Generates a short-lived ticket for secure redirect flow
 */
kickAuthRouter.post(
  "/ticket",
  clerkAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const ticket = crypto.randomBytes(16).toString("hex");

      // Store ticket in Redis with 30s expiration
      // Key format: api:auth:kick:ticket:{ticket_id} -> userId
      // Namespaced to avoid collisions in shared Redis instance
      await redis.set(`api:auth:kick:ticket:${ticket}`, req.userId!, "EX", 30);

      res.json({ ticket });
    } catch (error) {
      console.error("[Kick Auth] Ticket generation failed:", error);
      res.status(500).json({ error: "Failed to generate ticket" });
    }
  }
);

/**
 * GET /api/auth/kick/login
 * Initiates the OAuth flow using a one-time ticket
 */
kickAuthRouter.get("/login", async (req, res) => {
  try {
    const ticket = req.query.ticket as string;

    // Validate ticket from Redis
    const userId = await redis.get(`api:auth:kick:ticket:${ticket}`);

    if (!userId) {
      return res.status(401).json({ error: "Invalid or expired ticket" });
    }

    // Invalidate ticket immediately (Single Use)
    await redis.del(`api:auth:kick:ticket:${ticket}`);

    const { url, codeVerifier, state } = kickAuth.generateAuthUrl();

    // Store verifier in cookie (short lived, secure)
    res.cookie("kick_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: "lax", // Needed for redirect return
    });

    res.cookie("kick_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
      sameSite: "lax",
    });

    // Store user ID from ticket
    res.cookie("kick_user_id", userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
    });

    res.redirect(url);
  } catch (error) {
    console.error("[Kick Auth] Login error:", error);
    res.status(500).json({ error: "Failed to initiate login" });
  }
});

/**
 * GET /api/auth/kick/callback
 * Handle the redirect from Kick
 */
kickAuthRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const verifier = req.cookies.kick_verifier;
  const storedState = req.cookies.kick_state;
  const userId = req.cookies.kick_user_id; // Retrieve stored user ID

  console.log("[Kick Auth Debug] Callback received:", {
    queryCode: !!code,
    queryState: state,
    cookieVerifier: !!verifier,
    cookieState: storedState,
    cookieUserId: userId,
    stateMatch: state === storedState,
  });

  if (!code || !verifier || !userId || !state || state !== storedState) {
    return res
      .status(400)
      .json({ error: "Invalid request, state mismatch, or session expired" });
  }

  try {
    // Exchange code for tokens
    const tokens = await kickAuth.exchangeCode(code, verifier);

    if (!tokens) {
      return res.status(401).json({ error: "Failed to verify code" });
    }

    let platformUserId = "";
    let platformUsername = "";

    // Helper to fetch user profile
    const fetchKickUser = async (accessToken: string) => {
      // Confirmed working endpoint: https://api.kick.com/public/v1/users
      const url = "https://api.kick.com/public/v1/users";

      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          // Structure: { data: [ { user_id: 123, name: "user", ... } ] }
          const user = data.data?.[0];

          if (user && user.user_id) {
            return {
              id: String(user.user_id),
              username: user.name || user.username, // Fallback just in case
            };
          }
        } else {
          console.error(
            `[Kick Auth] Failed to fetch user: ${res.status} ${await res.text()}`
          );
        }
      } catch (err) {
        console.error(`[Kick Auth] Error fetching user:`, err);
      }
      return null;
    };

    const kickUser = await fetchKickUser(tokens.access_token);

    if (kickUser) {
      platformUserId = kickUser.id;
      platformUsername = kickUser.username;
    } else {
      console.error(
        "[Kick Auth] Failed to fetch user profile from all candidate endpoints"
      );
      return res.status(500).json({
        error: "Failed to fetch user profile from Kick. Check server logs.",
      });
    }

    // Save connection to DB
    await prisma.connection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: "KICK",
        },
      },
      create: {
        userId,
        provider: "KICK",
        platformUserId,
        platformUsername,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope.split(" "),
      },
      update: {
        platformUserId, // In case it changed? Unlikely
        platformUsername,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: tokens.scope.split(" "),
      },
    });

    // Clear cookies
    res.clearCookie("kick_verifier");
    res.clearCookie("kick_state");
    res.clearCookie("kick_user_id");

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/settings?success=kick`);
  } catch (error) {
    console.error("[Kick Auth] Callback error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/settings?error=kick_callback_failed`);
  }
});
