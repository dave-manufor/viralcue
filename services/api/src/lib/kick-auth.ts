import crypto from "crypto";
import { prisma } from "@viralcue/db";

import { encrypt } from "./crypto";

const KICK_AUTH_URL = "https://id.kick.com/oauth/authorize";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID || "";
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET || "";
const KICK_REDIRECT_URI =
  process.env.KICK_REDIRECT_URI ||
  "http://localhost:3000/api/auth/kick/callback";

export interface KickTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export class KickAuthClient {
  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePkcePair() {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    return { verifier, challenge };
  }

  /**
   * Generate the authorization URL for the user
   * Returns url and the codeVerifier (which must be stored in session/cookie)
   */
  generateAuthUrl() {
    const { verifier, challenge } = this.generatePkcePair();
    const state = crypto.randomBytes(16).toString("hex");
    const scopes = ["user:read", "channel:read"];

    const params = new URLSearchParams({
      client_id: KICK_CLIENT_ID,
      redirect_uri: KICK_REDIRECT_URI,
      response_type: "code",
      scope: scopes.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });

    return {
      url: `${KICK_AUTH_URL}?${params.toString()}`,
      codeVerifier: verifier,
      state,
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<KickTokenResponse | null> {
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: KICK_CLIENT_ID,
        client_secret: KICK_CLIENT_SECRET,
        redirect_uri: KICK_REDIRECT_URI,
        code,
        code_verifier: codeVerifier,
      });

      const response = await fetch(KICK_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Kick Auth] Token exchange failed:", errorText);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("[Kick Auth] Error exchanging code:", error);
      return null;
    }
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(connectionId: string, refreshToken: string) {
    try {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: KICK_CLIENT_ID,
        client_secret: KICK_CLIENT_SECRET,
        refresh_token: refreshToken,
      });

      const response = await fetch(KICK_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      if (!response.ok) {
        console.error(
          "[Kick Auth] Token refresh failed:",
          response.status,
          await response.text()
        );
        return null;
      }

      const tokens: KickTokenResponse = await response.json();

      // Update database
      await prisma.connection.update({
        where: { id: connectionId },
        data: {
          accessToken: encrypt(tokens.access_token)!,
          refreshToken: encrypt(tokens.refresh_token),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });

      return tokens.access_token;
    } catch (error) {
      console.error("[Kick Auth] Error refreshing token:", error);
      return null;
    }
  }
}

export const kickAuth = new KickAuthClient();
