import { Router, type Router as RouterType } from "express";
import { prisma } from "@viralcue/db";
import { CreateAffiliateLinkSchema } from "@viralcue/shared";
import { z } from "zod";
import { clerkAuth, AuthenticatedRequest } from "../middleware/clerk-auth";

export const affiliateLinksRouter: RouterType = Router();

// All affiliate link routes require authentication
affiliateLinksRouter.use(clerkAuth);

// GET /api/affiliate-links - List user's affiliate links
affiliateLinksRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;

    const links = await prisma.affiliateLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      affiliateLinks: links.map((l) => ({
        id: l.id,
        name: l.productName,
        url: l.affiliateUrl,
        triggerKeywords: l.keywords,
        isActive: l.isActive,
        clickCount: l.clickCount,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/affiliate-links - Create a new affiliate link
affiliateLinksRouter.post("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.userId!;
    const data = CreateAffiliateLinkSchema.parse(req.body);

    const link = await prisma.affiliateLink.create({
      data: {
        userId,
        productName: data.productName,
        keywords: data.keywords,
        affiliateUrl: data.affiliateUrl,
        platform: data.platform,
      },
    });

    res.status(201).json({
      id: link.id,
      name: link.productName,
      url: link.affiliateUrl,
      triggerKeywords: link.keywords,
      isActive: link.isActive,
      clickCount: link.clickCount,
      createdAt: link.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/affiliate-links/:id - Update an affiliate link
affiliateLinksRouter.put(
  "/:id",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const UpdateSchema = CreateAffiliateLinkSchema.partial().extend({
        isActive: z.boolean().optional(),
      });
      const data = UpdateSchema.parse(req.body);

      // Verify ownership
      const existing = await prisma.affiliateLink.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Affiliate link not found" });
      }

      const link = await prisma.affiliateLink.update({
        where: { id },
        data,
      });

      res.json({
        id: link.id,
        name: link.productName,
        url: link.affiliateUrl,
        triggerKeywords: link.keywords,
        isActive: link.isActive,
        updatedAt: link.updatedAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/affiliate-links/:id - Delete an affiliate link
affiliateLinksRouter.delete(
  "/:id",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      // Verify ownership
      const existing = await prisma.affiliateLink.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Affiliate link not found" });
      }

      await prisma.affiliateLink.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
