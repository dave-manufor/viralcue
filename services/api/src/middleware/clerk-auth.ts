import { Request, Response, NextFunction } from "express";
import { createClerkClient } from "@clerk/backend";
import { prisma } from "@viralcue/db";
import type { User } from "@viralcue/db";

// Initialize Clerk client
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey:
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

/**
 * Extended Express Request with authenticated user
 * Following industry standard: attach full user object to req.user
 */
export interface AuthenticatedRequest extends Request {
  /** Database user object - resolved by middleware */
  user?: User;
  /** Database user ID - convenience accessor */
  userId?: string;
  /** Clerk user ID (auth provider ID) */
  clerkUserId?: string;
}

/**
 * Get or create user in our database from Clerk ID
 * Called once per request in middleware, not in route handlers (DRY principle)
 */
async function getOrCreateUser(clerkUserId: string): Promise<User> {
  // First try to find existing user
  let user = await prisma.user.findUnique({
    where: { authProviderId: clerkUserId },
  });

  if (!user) {
    // Get user details from Clerk
    const clerkUser = await clerkClient.users.getUser(clerkUserId);

    // Create user in our database
    user = await prisma.user.create({
      data: {
        authProviderId: clerkUserId,
        authProvider: "clerk",
        email: clerkUser.emailAddresses[0]?.emailAddress,
        username:
          clerkUser.username ||
          clerkUser.firstName ||
          clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0],
        avatarUrl: clerkUser.imageUrl,
      },
    });

    console.log(
      `[Auth] Created new user: ${user.id} for Clerk ID: ${clerkUserId}`
    );
  }

  return user;
}

/**
 * Authentication middleware - verifies Clerk JWT and resolves DB user
 *
 * Per industry best practices:
 * - Verifies token authenticity
 * - Resolves database user once (DRY)
 * - Attaches user to req.user for downstream handlers
 * - Sets req.userId for convenience
 */
export async function clerkAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    // Verify token with Clerk
    const fakeRequest = new globalThis.Request("http://localhost", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await clerkClient.authenticateRequest(fakeRequest);

    if (!result.isSignedIn) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { userId: clerkUserId } = result.toAuth();

    if (!clerkUserId) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Resolve database user (single DB call per request - DRY)
    const user = await getOrCreateUser(clerkUserId);

    // Attach to request object - industry standard pattern
    req.user = user;
    req.userId = user.id;
    req.clerkUserId = clerkUserId;

    next();
  } catch (error) {
    console.error("[Auth] Token verification failed:", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Optional auth - doesn't fail if no token, but sets user if present
 */
export async function optionalClerkAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const fakeRequest = new globalThis.Request("http://localhost", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await clerkClient.authenticateRequest(fakeRequest);

    if (result.isSignedIn) {
      const { userId: clerkUserId } = result.toAuth();
      if (clerkUserId) {
        const user = await getOrCreateUser(clerkUserId);
        req.user = user;
        req.userId = user.id;
        req.clerkUserId = clerkUserId;
      }
    }
  } catch {
    // Token invalid, continue without user
  }

  next();
}

// Re-export for backwards compatibility during transition
export { getOrCreateUser };
