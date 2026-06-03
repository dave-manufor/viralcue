/**
 * Analytics Service - Lightweight internal product metrics.
 *
 * Tracks events for product insights without third-party dependencies.
 * Events are stored in the database for later analysis.
 */

import { prisma } from "@viralcue/db";

// Event types for context-related analytics
export type ContextEventType =
  | "context_created"
  | "context_updated"
  | "context_rollback"
  | "onboarding_completed"
  | "onboarding_dismissed"
  | "draft_approved"
  | "draft_rejected";

interface TrackEventOptions {
  userId: string;
  eventType: ContextEventType | string;
  metadata?: Record<string, any>;
}

/**
 * Track an analytics event.
 * Non-blocking - errors are logged but don't affect main flow.
 */
export async function trackEvent(options: TrackEventOptions): Promise<void> {
  const { userId, eventType, metadata } = options;

  try {
    await prisma.analyticsEvent.create({
      data: {
        userId,
        eventType,
        metadata: metadata || {},
      },
    });
  } catch (error) {
    // Log but don't fail - analytics should never break main functionality
    console.error("[Analytics] Failed to track event:", error);
  }
}

/**
 * Track context creation event.
 */
export async function trackContextCreated(
  userId: string,
  contextData: {
    contentCategory?: string;
    tonePresets?: string[];
    version?: number;
  }
): Promise<void> {
  await trackEvent({
    userId,
    eventType: "context_created",
    metadata: {
      contentCategory: contextData.contentCategory,
      toneCount: contextData.tonePresets?.length || 0,
      version: contextData.version,
    },
  });
}

/**
 * Track context rollback.
 */
export async function trackContextRollback(
  userId: string,
  fromVersion: number,
  toVersion: number
): Promise<void> {
  await trackEvent({
    userId,
    eventType: "context_rollback",
    metadata: { fromVersion, toVersion },
  });
}

/**
 * Track draft approval/rejection with context metadata.
 */
export async function trackDraftDecision(
  userId: string,
  decision: "approved" | "rejected",
  draftData: {
    draftId: string;
    hasUserContext: boolean;
    viralScore?: number;
  }
): Promise<void> {
  await trackEvent({
    userId,
    eventType: decision === "approved" ? "draft_approved" : "draft_rejected",
    metadata: {
      draftId: draftData.draftId,
      hasUserContext: draftData.hasUserContext,
      viralScore: draftData.viralScore,
    },
  });
}

/**
 * Track onboarding completion or dismissal.
 */
export async function trackOnboarding(
  userId: string,
  action: "completed" | "dismissed"
): Promise<void> {
  await trackEvent({
    userId,
    eventType:
      action === "completed" ? "onboarding_completed" : "onboarding_dismissed",
  });
}
