import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import { DraftStatusSchema } from "@viralcue/shared";
import { z } from "zod";
import { clerkAuth, AuthenticatedRequest } from "../middleware/clerk-auth";
import { PubSub } from "@google-cloud/pubsub";

export const draftsRouter: RouterType = Router();

// All draft routes require authentication
draftsRouter.use(clerkAuth);

const DraftActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  enabledChannels: z.array(z.string()).optional(),
});

// GET /api/drafts - List pending drafts for active sessions only
draftsRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const sessionId = req.query.sessionId as string;
    const includeAll = req.query.includeAll === "true";

    const drafts = await prisma.draft.findMany({
      where: {
        session: {
          userId,
          // Only show drafts from active sessions unless includeAll is true
          ...(includeAll ? {} : { endedAt: null }),
        },
        ...(sessionId && { sessionId }),
        status: "PENDING",
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
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/drafts/:id/action - Approve or reject a draft
draftsRouter.post(
  "/:id/action",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { action, enabledChannels } = DraftActionSchema.parse(req.body);

      // Verify draft belongs to user and get session details
      const draft = await prisma.draft.findFirst({
        where: {
          id,
          session: { userId },
        },
        include: {
          session: {
            include: {
              user: {
                select: {
                  settings: {
                    select: {
                      includeStreamLinkInPosts: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!draft) {
        return res.status(404).json({ error: "Draft not found" });
      }

      const newStatus = action === "approve" ? "APPROVED" : "REJECTED";

      // Update draft status
      const updatedDraft = await prisma.draft.update({
        where: { id },
        data: {
          status: newStatus,
          actionedAt: new Date(),
        },
      });

      // Increment session counter for approved/rejected drafts
      await prisma.streamingSession.update({
        where: { id: draft.sessionId },
        data: {
          [action === "approve" ? "draftsApproved" : "draftsRejected"]: {
            increment: 1,
          },
        },
      });

      // If approved, trigger publisher via Pub/Sub
      if (action === "approve") {
        // Determine default platforms based on draft type
        let defaultPlatforms: string[] = [];

        if (draft.draftType === "THREAD" || draft.draftType === "TWEET") {
          defaultPlatforms = ["twitter", "threads"];
        } else if (draft.draftType === "SHORT_VIDEO") {
          defaultPlatforms = ["tiktok", "instagram", "youtube"];
        }

        // Filter by enabledChannels if provided, otherwise use defaults
        const targetPlatforms = enabledChannels
          ? defaultPlatforms.filter((p) => enabledChannels.includes(p))
          : defaultPlatforms;

        // Also filter by actually connected accounts
        const connections = await prisma.connection.findMany({
          where: { userId },
          select: { provider: true },
        });
        const connectedPlatforms = connections.map((c: { provider: string }) =>
          c.provider.toLowerCase(),
        );
        const finalPlatforms = targetPlatforms.filter((p) =>
          connectedPlatforms.includes(p),
        );

        if (finalPlatforms.length === 0) {
          console.log(
            `[Drafts] No connected platforms for draft ${draft.id}, skipping publish`,
          );
        }

        const pubsub = new PubSub({
          projectId: process.env.GCP_PROJECT_ID || "viralcue-local",
        });
        const topicName =
          process.env.PUBSUB_TOPIC_DRAFT_APPROVED || "draft-approved";

        // Publish one event per platform for failure isolation
        await Promise.all(
          finalPlatforms.map(async (platform) => {
            const publisherPayload = {
              userId,
              draftType: draft.draftType,
              streamId: draft.session.platformStreamId || draft.sessionId,
              cardId: draft.id,
              platform: platform, // Single platform per event
              content: {
                // Universal content structure
                text: draft.content,
                caption: draft.content, // Alias for video platforms
                title: draft.content.substring(0, 100), // Fallback title
                videoUrl: draft.videoUrl,
              },
              // Stream link injection settings
              includeStreamLink:
                draft.session.user.settings?.includeStreamLinkInPosts ?? true,
              streamUrl: draft.session.streamUrl,
            };

            try {
              await pubsub.topic(topicName).publishMessage({
                data: Buffer.from(JSON.stringify(publisherPayload)),
              });
              console.log(
                `[Drafts] Published to ${topicName} for ${platform} (Draft ${draft.id})`,
              );
            } catch (pubsubError) {
              console.error(
                `[Drafts] Failed to publish for ${platform}:`,
                pubsubError,
              );
            }
          }),
        );
      }

      res.json({
        id: updatedDraft.id,
        status: updatedDraft.status,
        actionedAt: updatedDraft.actionedAt?.toISOString(),
        ...(action === "approve" && {
          content: updatedDraft.content,
          twitterComposeUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(updatedDraft.content || "")}`,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/drafts/history - Get draft history
draftsRouter.get("/history", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const status = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    if (status) {
      DraftStatusSchema.parse(status);
    }

    const [drafts, total] = await Promise.all([
      prisma.draft.findMany({
        where: {
          session: { userId },
          ...(status && { status: status as any }),
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.draft.count({
        where: {
          session: { userId },
          ...(status && { status: status as any }),
        },
      }),
    ]);

    res.json({
      drafts: drafts.map((d) => ({
        id: d.id,
        draftType: d.draftType,
        content: d.content,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        actionedAt: d.actionedAt?.toISOString() || null,
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
