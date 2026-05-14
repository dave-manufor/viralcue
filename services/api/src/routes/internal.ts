import { Router, type Router as RouterType, Request, Response } from "express";
import {
  pushDraftToUser,
  pushExtensionStatus,
  pushStreamStatus,
} from "../websocket/dashboard";

export const internalRouter: RouterType = Router();

// Internal API key validation
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "internal-dev-key";

internalRouter.use((req: Request, res: Response, next) => {
  const apiKey = req.headers["x-internal-key"];

  if (apiKey !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

/**
 * POST /internal/drafts/notify
 * Called by AI engine when a new draft is generated
 */
internalRouter.post("/drafts/notify", (req: Request, res: Response) => {
  const { userId, draft } = req.body;

  if (!userId || !draft) {
    return res.status(400).json({ error: "userId and draft required" });
  }

  const sent = pushDraftToUser(userId, draft);

  res.json({
    success: true,
    delivered: sent,
    message: sent ? "Draft pushed to user" : "User not connected",
  });
});

/**
 * POST /internal/extension/status
 * Called when extension status changes
 */
internalRouter.post("/extension/status", (req: Request, res: Response) => {
  const { userId, status, streamId, sessionId } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: "userId and status required" });
  }

  const sent = pushExtensionStatus(userId, status, streamId, sessionId);

  res.json({ success: true, delivered: sent });
});

/**
 * POST /internal/stream/status
 * Called when stream status changes
 */
internalRouter.post("/stream/status", (req: Request, res: Response) => {
  const { userId, streamId, status } = req.body;

  if (!userId || !streamId || !status) {
    return res
      .status(400)
      .json({ error: "userId, streamId, and status required" });
  }

  const sent = pushStreamStatus(userId, streamId, status);

  res.json({ success: true, delivered: sent });
});

/**
 * POST /internal/transcripts
 * Called by HLS Fetcher when transcript chunk is ready
 */
internalRouter.post("/transcripts", async (req: Request, res: Response) => {
  const { userId, sessionId, transcript } = req.body;

  if (!userId || !sessionId || !transcript) {
    return res
      .status(400)
      .json({ error: "userId, sessionId, and transcript required" });
  }

  console.log(
    `[Transcript] Session ${sessionId}: ${transcript.substring(0, 100)}...`
  );

  // TODO: Forward to AI Engine for draft generation
  // For now, just log it

  res.json({ success: true });
});

/**
 * POST /internal/capture/ended
 * Called by HLS Fetcher when capture job ends (manually or stream ended)
 * Closes the session in database and notifies the connected user
 */
internalRouter.post(
  "/capture/ended",
  async (req: Request, res: Response, next) => {
    const { sessionId, reason } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }

    console.log(
      `[Capture] Session ${sessionId} ended. Reason: ${reason || "unknown"}`
    );

    try {
      const { prisma } = await import("@viralcue/db");

      // Find and close the session
      const session = await prisma.streamingSession.findUnique({
        where: { id: sessionId },
      });

      if (session && !session.endedAt) {
        const endedAt = new Date();
        const totalMinutes =
          (endedAt.getTime() - session.startedAt.getTime()) / 1000 / 60;

        await prisma.streamingSession.update({
          where: { id: sessionId },
          data: { endedAt, totalMinutes },
        });

        // Notify user via WebSocket that monitoring has ended
        pushStreamStatus(
          session.userId,
          session.platformStreamId || "",
          "STOPPED"
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[Capture] Error closing session:", error);
      next(error);
    }
  }
);

/**
 * POST /internal/clips/ready
 * Called by Clip Fetcher when a video clip is ready
 */
internalRouter.post(
  "/clips/ready",
  async (req: Request, res: Response, next) => {
    const {
      userId,
      sessionId,
      streamId,
      clipUrl,
      duration,
      viralScore,
      caption,
      hashtags,
    } = req.body;

    if (!userId || !sessionId || !clipUrl) {
      return res
        .status(400)
        .json({ error: "userId, sessionId, and clipUrl required" });
    }

    try {
      const { prisma } = await import("@viralcue/db");

      // Construct content
      let content =
        caption ||
        `Viral moment captured! (Score: ${(viralScore * 10).toFixed(1)}/10)`;
      if (hashtags && Array.isArray(hashtags) && hashtags.length > 0) {
        content += `\n\n${hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
      }

      // Create a new Draft for this clip
      // In the future, we might try to link this to an existing text draft based on timestamp
      const draft = await prisma.draft.create({
        data: {
          sessionId,
          draftType: "SHORT_VIDEO", // Video clips are short videos
          content,
          videoUrl: clipUrl,
          confidenceScore: viralScore,
          status: "PENDING",
        },
      });

      console.log(`[Clip] Created draft ${draft.id} for clip ${clipUrl}`);

      // Notify user
      pushDraftToUser(userId, draft);

      res.json({ success: true, draftId: draft.id });
    } catch (error) {
      console.error("[Clip] Error creating draft:", error);
      next(error);
    }
  }
);

/**
 * GET /internal/debug/streams/:userId
 * Debug endpoint to test stream fetching
 */
internalRouter.get(
  "/debug/streams/:userId",

  async (req: Request, res: Response, next) => {
    const { userId } = req.params;

    const { getUserActiveStreams } = await import("../middleware/stream-auth");

    try {
      const streams = await getUserActiveStreams(userId);
      res.json({ streams, count: streams.length });
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * GET /internal/user/:userId/context
 * Called by AI Engine to fetch user's active context for personalization
 */
internalRouter.get(
  "/user/:userId/context",

  async (req: Request, res: Response, next) => {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    try {
      const { prisma } = await import("@viralcue/db");

      // Find user's settings with active context
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        include: {
          contextVersions: {
            where: { isActive: true },
            take: 1,
            orderBy: { version: "desc" },
          },
        },
      });

      if (!settings || settings.contextVersions.length === 0) {
        return res.json({ context: null });
      }

      const activeContext = settings.contextVersions[0];

      res.json({
        context: {
          contentCategory: activeContext.contentCategory,
          contentCategoryOther: activeContext.contentCategoryOther,
          tonePresets: activeContext.tonePresets,
          channelDescription: activeContext.channelDescription,
          targetAudience: activeContext.targetAudience,
          avoidTopics: activeContext.avoidTopics,
          customInstructions: activeContext.customInstructions,
        },
      });
    } catch (error: any) {
      console.error("[Internal] Error fetching user context:", error);
      next(error);
    }
  }
);
