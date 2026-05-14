import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import { clerkAuth } from "../middleware/clerk-auth";
import {
  getUserActiveStreams,
  validateStreamOwnership,
  AuthenticatedRequest,
} from "../middleware/stream-auth";
import { sensitiveOpLimiter } from "../middleware/rate-limit";

export const streamsRouter: RouterType = Router();

/**
 * Build stream URL from platform and channel name
 */
function buildStreamUrl(platform: string, channelName: string): string {
  switch (platform) {
    case "TWITCH":
      return `https://twitch.tv/${channelName}`;
    case "YOUTUBE":
      return `https://youtube.com/@${channelName}/live`;
    case "KICK":
      return `https://kick.com/${channelName}`;
    default:
      return "";
  }
}

// All routes require authentication
streamsRouter.use(clerkAuth);

/**
 * GET /api/streams
 * List user's active streams from connected platforms
 */
streamsRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  const userId = req.userId!;

  try {
    const streams = await getUserActiveStreams(userId);

    // Check for active monitoring session
    const activeSession = await prisma.streamingSession.findFirst({
      where: {
        userId,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    res.json({
      streams: streams.map((s: any) => ({
        id: s.id,
        platform: s.platform || "TWITCH",
        title: s.title,
        gameName: s.game_name,
        viewerCount: s.viewer_count,
        startedAt: s.started_at,
        thumbnailUrl: s.thumbnail_url
          ?.replace("{width}", "320")
          .replace("{height}", "180"),
        isLive: s.type === "live",
        isMonitoring: activeSession?.platformStreamId === s.id,
      })),
      activeSession: activeSession
        ? {
            sessionId: activeSession.id,
            streamId: activeSession.platformStreamId,
            startedAt: activeSession.startedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error("Failed to fetch streams:", error);
    next(error);
  }
});

/**
 * POST /api/streams/:streamId/activate
 * Start monitoring a stream (validates ownership first)
 *
 * IMPORTANT: Only ONE stream can be monitored at a time.
 * This is enforced server-side for compliance and resource management.
 */
streamsRouter.post(
  "/:streamId/activate",
  sensitiveOpLimiter,
  validateStreamOwnership,
  async (req: AuthenticatedRequest, res, next) => {
    const userId = req.userId!;
    const { streamId } = req.params;
    const stream = req.stream!;

    try {
      // ENFORCEMENT: Check if user already has an active monitoring session
      const existingSession = await prisma.streamingSession.findFirst({
        where: {
          userId,
          endedAt: null,
        },
      });

      if (existingSession) {
        // User already has an active session - return error
        return res.status(409).json({
          error: "You already have an active monitoring session",
          code: "SESSION_ALREADY_ACTIVE",
          existingSession: {
            sessionId: existingSession.id,
            streamId: existingSession.platformStreamId,
            startedAt: existingSession.startedAt.toISOString(),
          },
        });
      }

      const platform = req.platformConnection?.platform || "TWITCH";

      // Build stream URL for link injection
      const streamUrl = buildStreamUrl(platform, stream.user_login);

      // Create streaming session in database
      const session = await prisma.streamingSession.create({
        data: {
          userId,
          platform: platform as any, // Cast to Platform enum
          platformStreamId: streamId,
          channelName: stream.user_login,
          streamTitle: stream.title,
          streamUrl,
        },
      });

      // Start server-side HLS audio capture
      const { startHlsCapture } = await import("../lib/hls-jobs");
      const captureStarted = await startHlsCapture({
        userId,
        sessionId: session.id,
        channelName: stream.user_login,
        platform: platform as "TWITCH" | "KICK",
      });

      if (!captureStarted) {
        console.warn(
          `[Streams] HLS capture failed to start for session ${session.id}`
        );
        // Continue anyway - capture service might be down but session is created
      }

      console.log(
        `[Streams] Started monitoring stream ${streamId} for user ${userId}`
      );

      res.json({
        success: true,
        sessionId: session.id,
        captureStarted,
        stream: {
          id: stream.id,
          title: stream.title,
          gameName: stream.game_name,
          viewerCount: stream.viewer_count,
        },
      });
    } catch (error) {
      console.error("Failed to activate stream:", error);
      next(error);
    }
  }
);

/**
 * POST /api/streams/:streamId/deactivate
 * Stop monitoring a stream
 * Gracefully ends the session and stops HLS capture
 */
streamsRouter.post(
  "/:streamId/deactivate",
  sensitiveOpLimiter,
  validateStreamOwnership,
  async (req: AuthenticatedRequest, res, next) => {
    const userId = req.userId!;
    const { streamId } = req.params;

    try {
      // Find and close active session
      const session = await prisma.streamingSession.findFirst({
        where: {
          userId,
          platformStreamId: streamId,
          endedAt: null,
        },
        orderBy: {
          startedAt: "desc",
        },
      });

      if (!session) {
        return res.status(404).json({
          error: "No active session found for this stream",
          code: "NO_ACTIVE_SESSION",
        });
      }

      const endedAt = new Date();
      const totalMinutes =
        (endedAt.getTime() - session.startedAt.getTime()) / 1000 / 60;

      // End the session in database
      await prisma.streamingSession.update({
        where: { id: session.id },
        data: {
          endedAt,
          totalMinutes,
        },
      });

      // Stop HLS capture
      const { stopHlsCapture } = await import("../lib/hls-jobs");
      await stopHlsCapture(session.id);

      console.log(
        `[Streams] Stopped monitoring stream ${streamId} for user ${userId}`
      );

      res.json({
        success: true,
        sessionId: session.id,
        totalMinutes,
      });
    } catch (error) {
      console.error("Failed to deactivate stream:", error);
      next(error);
    }
  }
);

/**
 * GET /api/streams/active-session
 * Get the user's current active monitoring session (if any)
 */
streamsRouter.get(
  "/active-session",
  async (req: AuthenticatedRequest, res, next) => {
    const userId = req.userId!;

    try {
      const activeSession = await prisma.streamingSession.findFirst({
        where: {
          userId,
          endedAt: null,
        },
        orderBy: { startedAt: "desc" },
      });

      if (!activeSession) {
        return res.json({ activeSession: null });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twitchUsername: true },
      });

      res.json({
        activeSession: {
          sessionId: activeSession.id,
          streamId: activeSession.platformStreamId,
          platform: activeSession.platform,
          channelName:
            activeSession.channelName || user?.twitchUsername || "Unknown",
          streamTitle: activeSession.streamTitle || null,
          startedAt: activeSession.startedAt.toISOString(),
          draftsApproved: activeSession.draftsApproved,
          draftsRejected: activeSession.draftsRejected,
        },
      });
    } catch (error) {
      console.error("Failed to get active session:", error);
      next(error);
    }
  }
);

/**
 * GET /api/streams/:streamId
 * Get stream details (validates ownership first)
 */
streamsRouter.get(
  "/:streamId",
  validateStreamOwnership,
  async (req: AuthenticatedRequest, res) => {
    const stream = req.stream!;

    const platform = req.platformConnection?.platform || "TWITCH";

    res.json({
      id: stream.id,
      platform,
      title: stream.title,
      gameName: stream.game_name,
      viewerCount: stream.viewer_count,
      startedAt: stream.started_at,
      language: stream.language,
      thumbnailUrl: stream.thumbnail_url
        ?.replace("{width}", "640")
        .replace("{height}", "360"),
      isLive: stream.type === "live",
    });
  }
);
