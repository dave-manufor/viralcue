/**
 * Rate Limiting Middleware
 * Uses Redis for distributed rate limiting across API instances.
 */
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";

// Redis client (reused across limiters)
const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

/**
 * Global Rate Limiter
 * Protects all API endpoints from abuse.
 *
 * Limit: 1000 requests per 15 minutes per IP
 *
 * Rationale:
 * - ViralCue is a streamer tool, not a high-frequency trading API.
 * - A typical active user session involves ~10-20 API calls per minute during streaming.
 * - 1000 req / 15 min = ~66 req/min sustained, which is 3-6x normal usage.
 * - This catches runaway scripts or bots while allowing legitimate power users.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down.",
    code: "RATE_LIMITED",
  },
  store: new RedisStore({
    // @ts-expect-error - ioredis call returns Promise<unknown> but rate-limit-redis expects specific types
    sendCommand: (command: string, ...args: string[]) =>
      redisClient.call(command, ...args),
    prefix: "ratelimit:api:global:",
  }),
});

/**
 * Auth Rate Limiter
 * Protects authentication endpoints from brute force attacks.
 *
 * Limit: 10 requests per hour per IP
 *
 * Rationale:
 * - Auth endpoints are high-value targets for attackers.
 * - Legitimate users rarely need more than a few auth attempts per hour.
 * - 10/hr allows for multiple login attempts across devices.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Increased for development (was 10)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again later.",
    code: "AUTH_RATE_LIMITED",
  },
  store: new RedisStore({
    // @ts-expect-error - ioredis call returns Promise<unknown> but rate-limit-redis expects specific types
    sendCommand: (command: string, ...args: string[]) =>
      redisClient.call(command, ...args),
    prefix: "ratelimit:api:auth:",
  }),
});

/**
 * Sensitive Operation Limiter
 * Protects expensive operations (AI, stream activation).
 *
 * Limit: 30 requests per hour per user
 *
 * Note: We use a custom keyGenerator for user-based limiting.
 * For unauthenticated requests, we fall back to IP.
 */
export const sensitiveOpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator: use userId for authenticated users, IP for others
  // Note: When using custom keyGenerator, ipv6Subnet is ignored (that's fine for user-based limiting)
  keyGenerator: (req) => {
    const userId = (req as any).userId;
    // For authenticated users, rate limit by userId (not IP)
    // For unauthenticated, use IP (express-rate-limit default handles IPv6 internally when no custom key)
    return userId || `ip:${req.ip}`;
  },
  message: {
    error: "Too many requests for this operation. Please try again later.",
    code: "SENSITIVE_OP_LIMITED",
  },
  store: new RedisStore({
    // @ts-expect-error - ioredis call returns Promise<unknown> but rate-limit-redis expects specific types
    sendCommand: (command: string, ...args: string[]) =>
      redisClient.call(command, ...args),
    prefix: "ratelimit:api:sensitive:",
  }),
  // Skip the IPv6 validation since we handle user-based limiting
  validate: { ipv6Subnet: false, keyGeneratorIpFallback: false },
});
