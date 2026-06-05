import { z } from "zod";

// ============================================
// USER TYPES
// ============================================

export const SubscriptionTierSchema = z.enum([
  "FREE",
  "STARTER",
  "PRO",
  "AGENCY",
]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  twitchId: z.string().nullable(),
  twitchUsername: z.string().nullable(),
  subscriptionTier: SubscriptionTierSchema,
  streamingHoursUsed: z.number(),
  streamingHoursLimit: z.number(),
});
export type User = z.infer<typeof UserSchema>;

// ============================================
// DRAFT TYPES
// ============================================

export const DraftTypeSchema = z.enum([
  "THREAD",
  "SHORT_VIDEO",
  "CHAT_MESSAGE",
  "AFFILIATE",
  "TWEET", // Legacy/Deprecated
]);
export type DraftType = z.infer<typeof DraftTypeSchema>;

export const DraftStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "POSTED",
  "EXPIRED",
]);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const DraftSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  draftType: DraftTypeSchema,
  content: z.string(),
  confidenceScore: z.number().min(0).max(1).nullable(),
  status: DraftStatusSchema,
  affiliateLinkId: z.string().uuid().nullable(),
  transcriptSnippet: z.string().nullable(),
  createdAt: z.string().datetime(),
  actionedAt: z.string().datetime().nullable(),
});
export type Draft = z.infer<typeof DraftSchema>;

// ============================================
// AFFILIATE LINK TYPES
// ============================================

export const AffiliateLinkSchema = z.object({
  id: z.string().uuid(),
  productName: z.string().min(1).max(255),
  keywords: z.array(z.string()),
  affiliateUrl: z.string().url(),
  platform: z.string().nullable(),
  commissionRate: z.number().min(0).max(100).nullable(),
  isActive: z.boolean(),
  clickCount: z.number(),
});
export type AffiliateLink = z.infer<typeof AffiliateLinkSchema>;

export const CreateAffiliateLinkSchema = z.object({
  productName: z.string().min(1).max(255),
  keywords: z.array(z.string().min(1)).min(1),
  affiliateUrl: z.string().url(),
  platform: z.string().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
});
export type CreateAffiliateLink = z.infer<typeof CreateAffiliateLinkSchema>;

// ============================================
// API RESPONSE TYPES
// ============================================

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

// ============================================
// STREAMING SESSION TYPES
// ============================================

export const PlatformSchema = z.enum(["TWITCH", "YOUTUBE", "KICK"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const StreamingSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  platform: PlatformSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  draftsGenerated: z.number().int(),
  draftsApproved: z.number().int(),
  draftsRejected: z.number().int(),
});
export type StreamingSession = z.infer<typeof StreamingSessionSchema>;
