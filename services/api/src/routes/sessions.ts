import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import { PlatformSchema } from "@viralcue/shared";
import { z } from "zod";
import { clerkAuth, AuthenticatedRequest } from "../middleware/clerk-auth";

export const sessionsRouter: RouterType = Router();

// All session routes require authentication
sessionsRouter.use(clerkAuth);

const StartSessionSchema = z.object({
  platform: PlatformSchema,
  platformStreamId: z.string().optional(),
});

// POST /api/sessions/start - Start a new streaming session
sessionsRouter.post("/start", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const body = StartSessionSchema.parse(req.body);

    const session = await prisma.streamingSession.create({
      data: {
        userId,
        platform: body.platform,
        platformStreamId: body.platformStreamId,
      },
    });

    res.status(201).json({
      id: session.id,
      userId: session.userId,
      platform: session.platform,
      platformStreamId: session.platformStreamId,
      startedAt: session.startedAt.toISOString(),
      endedAt: null,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/sessions/:id/end - End a streaming session
sessionsRouter.post(
  "/:id/end",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const session = await prisma.streamingSession.findFirst({
        where: { id, userId },
      });

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const endedAt = new Date();
      const totalMinutes =
        (endedAt.getTime() - session.startedAt.getTime()) / 1000 / 60;

      const updatedSession = await prisma.streamingSession.update({
        where: { id },
        data: { endedAt, totalMinutes },
      });

      res.json({
        id: updatedSession.id,
        endedAt: endedAt.toISOString(),
        totalMinutes: updatedSession.totalMinutes,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sessions - List user's sessions
sessionsRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [sessions, total] = await Promise.all([
      prisma.streamingSession.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.streamingSession.count({ where: { userId } }),
    ]);

    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        platform: s.platform,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() || null,
        totalMinutes: s.totalMinutes,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});
