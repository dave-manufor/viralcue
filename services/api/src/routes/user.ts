import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import { clerkAuth, AuthenticatedRequest } from "../middleware/clerk-auth";
import {
  sanitizeContext,
  validateContext,
  UserContext,
} from "../lib/context-sanitizer";

import {
  trackContextCreated,
  trackContextRollback,
  trackOnboarding,
} from "../lib/analytics";

export const userRouter: RouterType = Router();

// All user routes require authentication
userRouter.use(clerkAuth);

/**
 * Helper to ensure UserSettings exists for a user
 */
async function ensureUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: {
      contextVersions: {
        where: { isActive: true },
        take: 1,
        orderBy: { version: "desc" },
      },
    },
  });
}

// GET /api/user/me - Get current user profile
userRouter.get("/me", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Fetch user with subscription plan
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscriptionPlan: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const connections = await prisma.connection.findMany({
      where: { userId: user.id },
      select: {
        provider: true,
        platformUsername: true,
        connectedAt: true,
      },
    });

    const settings = await ensureUserSettings(user.id);

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl,
      twitchUsername: user.twitchUsername,
      subscriptionTier: user.subscriptionPlan?.name || "free",
      streamingHoursUsed: user.streamingHoursUsed,
      streamingHoursLimit: user.subscriptionPlan?.streamingHoursLimit || 5,
      connections,
      contextPromptDismissed: settings.contextPromptDismissed,
      hasActiveContext: settings.contextVersions.length > 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/user/connections - Get user's connected social accounts
userRouter.get("/connections", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const connections = await prisma.connection.findMany({
      where: { userId },
      select: {
        provider: true,
        platformUserId: true,
        platformUsername: true,
        connectedAt: true,
        expiresAt: true,
        refreshToken: true,
      },
    });

    // Add computed needsReconnect field
    const now = new Date();
    const connectionsWithHealth = connections.map((c) => ({
      provider: c.provider,
      platformUserId: c.platformUserId,
      platformUsername: c.platformUsername,
      connectedAt: c.connectedAt,
      expiresAt: c.expiresAt,
      // Only needs reconnect if expired AND no refresh token available
      needsReconnect: c.expiresAt
        ? c.expiresAt < now && !c.refreshToken
        : false,
    }));

    res.json({ connections: connectionsWithHealth });
  } catch (error) {
    next(error);
  }
});
userRouter.get(
  "/subscription",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user!.id;

      // Fetch user with subscription plan
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscriptionPlan: true },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const hoursLimit = Number(
        user.subscriptionPlan?.streamingHoursLimit || 5
      );
      const hoursUsed = Number(user.streamingHoursUsed);

      res.json({
        tier: user.subscriptionPlan?.name || "free",
        status: user.subscriptionStatus,
        hoursUsed,
        hoursLimit,
        hoursRemaining: Math.max(0, hoursLimit - hoursUsed),
        billingCycleStart: user.billingCycleStart?.toISOString(),
        billingCycleEnd: user.billingCycleStart
          ? new Date(
              user.billingCycleStart.getTime() + 30 * 24 * 60 * 60 * 1000
            ).toISOString()
          : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/user/settings - Get user settings with active context
userRouter.get("/settings", async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const settings = await ensureUserSettings(user.id);
    const activeContext = settings.contextVersions[0] || null;

    res.json({
      includeStreamLinkInPosts: settings.includeStreamLinkInPosts,
      autoSendAffiliateLinks: settings.autoSendAffiliateLinks,
      contextPromptDismissed: settings.contextPromptDismissed,
      enabledTextChannels: settings.enabledTextChannels,
      enabledVideoChannels: settings.enabledVideoChannels,
      activeContext: activeContext
        ? {
            version: activeContext.version,
            contentCategory: activeContext.contentCategory,
            contentCategoryOther: activeContext.contentCategoryOther,
            tonePresets: activeContext.tonePresets,
            channelDescription: activeContext.channelDescription,
            targetAudience: activeContext.targetAudience,
            avoidTopics: activeContext.avoidTopics,

            createdAt: activeContext.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/user/settings - Update user settings
userRouter.patch("/settings", async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const {
      includeStreamLinkInPosts,
      autoSendAffiliateLinks,
      enabledTextChannels,
      enabledVideoChannels,
    } = req.body;

    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...(typeof includeStreamLinkInPosts === "boolean" && {
          includeStreamLinkInPosts,
        }),
        ...(typeof autoSendAffiliateLinks === "boolean" && {
          autoSendAffiliateLinks,
        }),
        ...(Array.isArray(enabledTextChannels) && { enabledTextChannels }),
        ...(Array.isArray(enabledVideoChannels) && { enabledVideoChannels }),
      },
      update: {
        ...(typeof includeStreamLinkInPosts === "boolean" && {
          includeStreamLinkInPosts,
        }),
        ...(typeof autoSendAffiliateLinks === "boolean" && {
          autoSendAffiliateLinks,
        }),
        ...(Array.isArray(enabledTextChannels) && { enabledTextChannels }),
        ...(Array.isArray(enabledVideoChannels) && { enabledVideoChannels }),
      },
    });

    res.json({
      success: true,
      includeStreamLinkInPosts: settings.includeStreamLinkInPosts,
      autoSendAffiliateLinks: settings.autoSendAffiliateLinks,
      enabledTextChannels: settings.enabledTextChannels,
      enabledVideoChannels: settings.enabledVideoChannels,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/user/settings/dismiss-prompt - Dismiss context onboarding
userRouter.post(
  "/settings/dismiss-prompt",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;

      await prisma.userSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, contextPromptDismissed: true },
        update: { contextPromptDismissed: true },
      });

      trackOnboarding(user.id, "dismissed");

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/user/context - Get active context version
userRouter.get("/context", async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const settings = await ensureUserSettings(user.id);

    const activeContext = await prisma.userContextVersion.findFirst({
      where: { settingsId: settings.id, isActive: true },
      orderBy: { version: "desc" },
    });

    res.json({ context: activeContext });
  } catch (error) {
    next(error);
  }
});

// POST /api/user/context - Create new context version
userRouter.post("/context", async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const contextData = req.body as UserContext;

    // Validate and sanitize
    const validation = validateContext(contextData);
    const sanitized = sanitizeContext(contextData);

    const settings = await ensureUserSettings(user.id);

    // Get current max version
    const latestVersion = await prisma.userContextVersion.findFirst({
      where: { settingsId: settings.id },
      orderBy: { version: "desc" },
    });

    const newVersion = (latestVersion?.version || 0) + 1;

    // Deactivate all previous versions
    await prisma.userContextVersion.updateMany({
      where: { settingsId: settings.id },
      data: { isActive: false },
    });

    // Create new active version
    const context = await prisma.userContextVersion.create({
      data: {
        settingsId: settings.id,
        version: newVersion,
        isActive: true,
        contentCategory: (sanitized.contentCategory as any) || "OTHER",
        contentCategoryOther: sanitized.contentCategoryOther,
        tonePresets: (sanitized.tonePresets as any[]) || [],
        channelDescription: sanitized.channelDescription,
        targetAudience: sanitized.targetAudience,
        avoidTopics: sanitized.avoidTopics || [],
      },
    });

    // Mark prompt as dismissed since they've set context
    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { contextPromptDismissed: true },
    });

    // Track event
    trackContextCreated(user.id, {
      contentCategory: context.contentCategory,
      tonePresets: context.tonePresets,
      version: context.version,
    });

    res.json({
      success: true,
      context,
      validation,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/user/context/versions - List all context versions
userRouter.get(
  "/context/versions",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const settings = await ensureUserSettings(user.id);

      const versions = await prisma.userContextVersion.findMany({
        where: { settingsId: settings.id },
        orderBy: { version: "desc" },
      });

      res.json({ versions });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/user/context/rollback/:version - Rollback to specific version
userRouter.post(
  "/context/rollback/:version",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const targetVersion = parseInt(req.params.version, 10);

      if (isNaN(targetVersion)) {
        return res.status(400).json({ error: "Invalid version number" });
      }

      const settings = await ensureUserSettings(user.id);

      // Verify target version exists
      const targetContext = await prisma.userContextVersion.findFirst({
        where: { settingsId: settings.id, version: targetVersion },
      });

      if (!targetContext) {
        return res.status(404).json({ error: "Version not found" });
      }

      // Deactivate all versions
      await prisma.userContextVersion.updateMany({
        where: { settingsId: settings.id },
        data: { isActive: false },
      });

      // Activate target version
      const newActive = await prisma.userContextVersion.update({
        where: { id: targetContext.id },
        data: { isActive: true },
      });

      // Track rollback
      const currentVersion = settings.contextVersions.find((v) => v.isActive);
      trackContextRollback(
        user.id,
        currentVersion?.version || 0,
        newActive.version
      );

      res.json({
        success: true,
        activeVersion: targetVersion,
        context: targetContext,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/user/data-export - GDPR data export
userRouter.get("/data-export", async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        settings: { include: { contextVersions: true } },
        connections: {
          select: { provider: true, platformUsername: true, connectedAt: true },
        },
        sessions: {
          include: {
            drafts: {
              select: {
                id: true,
                content: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        affiliateLinks: true,
      },
    });

    res.json({
      profile: {
        id: fullUser?.id,
        email: fullUser?.email,
        username: fullUser?.username,
        createdAt: fullUser?.createdAt,
      },
      settings: fullUser?.settings,
      contextHistory: fullUser?.settings?.contextVersions,
      connections: fullUser?.connections,
      streamingHistory: fullUser?.sessions,
      affiliateLinks: fullUser?.affiliateLinks,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
