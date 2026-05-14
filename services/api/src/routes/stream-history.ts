import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import { clerkAuth, AuthenticatedRequest } from "../middleware/clerk-auth";

export const streamHistoryRouter: RouterType = Router();

// All routes require authentication
streamHistoryRouter.use(clerkAuth);

/**
 * GET /api/stream-history
 * List past streams within user's retention period
 */
streamHistoryRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    // Get user's subscription plan for retention period
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscriptionPlan: true },
    });

    const retentionHours = user?.subscriptionPlan?.draftRetentionHours ?? 24;
    const retentionCutoff = new Date(
      Date.now() - retentionHours * 60 * 60 * 1000
    );

    // Get past streams within retention period
    const streams = await prisma.streamingSession.findMany({
      where: {
        userId,
        endedAt: {
          not: null,
          gte: retentionCutoff,
        },
      },
      orderBy: { endedAt: "desc" },
      include: {
        _count: {
          select: { drafts: true },
        },
      },
    });

    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    res.json({
      streams: streams.map((s) => {
        const endedAtMs = s.endedAt!.getTime();
        const expiresAtMs = endedAtMs + retentionHours * 60 * 60 * 1000;
        const expiresInMs = expiresAtMs - now;

        return {
          id: s.id,
          platform: s.platform,
          channelName: s.channelName,
          streamTitle: s.streamTitle,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt!.toISOString(),
          durationMinutes: s.totalMinutes ? Number(s.totalMinutes) : null,
          // Use actual relation count for total drafts
          draftsGenerated: s._count.drafts, // Replaces s.draftsGenerated
          // Keep using stored counts for approved/rejected in list view for performance
          // OR we could fetch them if needed, but list view usually tolerates slight inexactness
          // However, if generated is 0 but stored says 5, that's weird.
          // Let's rely on _count for generated which is the most visible "total".
          draftsApproved: s.draftsApproved,
          draftsRejected: s.draftsRejected,
          expiresAt: new Date(expiresAtMs).toISOString(),
          isExpiringSoon: expiresInMs < TWO_HOURS_MS,
          expiresInHours: Math.max(
            0,
            Math.round(expiresInMs / (60 * 60 * 1000))
          ),
        };
      }),
      retentionHours,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/stream-history/:id
 * Get single stream with details
 */
streamHistoryRouter.get(
  "/:id",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.userId!;
      const { id } = req.params;

      const stream = await prisma.streamingSession.findFirst({
        where: {
          id,
          userId,
          endedAt: { not: null },
        },
        include: {
          user: {
            include: { subscriptionPlan: true },
          },
        },
      });

      if (!stream) {
        return res.status(404).json({ error: "Stream not found" });
      }

      // Fetch accurate draft counts dynamically
      const draftCounts = await prisma.draft.groupBy({
        by: ["status"],
        where: { sessionId: id },
        _count: {
          _all: true,
        },
      });

      const totalDrafts = draftCounts.reduce(
        (acc, curr) => acc + curr._count._all,
        0
      );
      const approvedCount =
        draftCounts.find((c) => c.status === "APPROVED")?._count._all || 0;
      const rejectedCount =
        draftCounts.find((c) => c.status === "REJECTED")?._count._all || 0;

      const retentionHours =
        stream.user?.subscriptionPlan?.draftRetentionHours ?? 24;
      const endedAtMs = stream.endedAt!.getTime();
      const expiresAtMs = endedAtMs + retentionHours * 60 * 60 * 1000;
      const now = Date.now();
      const expiresInMs = expiresAtMs - now;
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

      res.json({
        stream: {
          id: stream.id,
          platform: stream.platform,
          channelName: stream.channelName,
          streamTitle: stream.streamTitle,
          startedAt: stream.startedAt.toISOString(),
          endedAt: stream.endedAt!.toISOString(),
          durationMinutes: stream.totalMinutes
            ? Number(stream.totalMinutes)
            : null,
          // Use dynamic accurate counts
          draftsGenerated: totalDrafts,
          draftsApproved: approvedCount,
          draftsRejected: rejectedCount,
          expiresAt: new Date(expiresAtMs).toISOString(),
          isExpiringSoon: expiresInMs < TWO_HOURS_MS,
          expiresInHours: Math.max(
            0,
            Math.round(expiresInMs / (60 * 60 * 1000))
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/stream-history/:id/drafts
 * Get drafts for a specific stream
 */
streamHistoryRouter.get(
  "/:id/drafts",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.userId!;
      const { id } = req.params;
      const status = req.query.status as string | undefined;

      // Verify stream belongs to user
      const stream = await prisma.streamingSession.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!stream) {
        return res.status(404).json({ error: "Stream not found" });
      }

      const drafts = await prisma.draft.findMany({
        where: {
          sessionId: id,
          ...(status && { status: status as any }),
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        drafts: drafts.map((d) => ({
          id: d.id,
          draftType: d.draftType,
          content: d.content,
          confidenceScore: d.confidenceScore,
          status: d.status,
          videoUrl: d.videoUrl,
          transcriptSnippet: d.transcriptSnippet,
          createdAt: d.createdAt.toISOString(),
          actionedAt: d.actionedAt?.toISOString() || null,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);
