/**
 * Pub/Sub Consumer - Subscribes to viralcue-drafts topic and pushes to Socket.IO
 */
import { PubSub, Message, Subscription } from "@google-cloud/pubsub";
import { pushDraftToUser } from "../websocket/dashboard";

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "viralcue-local";
const DRAFTS_SUBSCRIPTION = process.env.DRAFTS_SUBSCRIPTION || "dashboard-sub";

let pubsubClient: PubSub | null = null;
let subscription: Subscription | null = null;
let isSubscribed = false;

function getClient(): PubSub {
  if (!pubsubClient) {
    pubsubClient = new PubSub({
      projectId: GCP_PROJECT_ID,
    });

    const isEmulator = !!process.env.PUBSUB_EMULATOR_HOST;
    console.log(
      `[PubSub] Connected to ${isEmulator ? "emulator" : "production"}`
    );
  }
  return pubsubClient;
}

async function handleMessage(message: Message): Promise<void> {
  try {
    const body = JSON.parse(message.data.toString());
    const { userId, streamId, draft } = body;

    if (userId && draft) {
      console.log(`[PubSub] Received draft for user ${userId}`);

      // Map string type to Enum
      // Map string type to Enum
      let draftType = "CHAT_MESSAGE";
      if (draft.draft_type === "SHORT_VIDEO" || draft.draft_type === "CLIP")
        draftType = "SHORT_VIDEO";
      else if (draft.draft_type === "THREAD" || draft.draft_type === "TWEET")
        draftType = "THREAD";
      else if (draft.draft_type === "AFFILIATE") draftType = "AFFILIATE";

      // Persist to PostgreSQL (legacy, for history)
      const { prisma } = await import("@viralcue/db");
      const savedDraft = await prisma.draft.create({
        data: {
          sessionId: draft.session_id,
          draftType: draftType as any,
          content: draft.content,
          confidenceScore: draft.confidence_score,
          transcriptSnippet: draft.transcript_snippet,
        },
      });
      console.log(`[PubSub] Persisted draft ${savedDraft.id} to PostgreSQL`);

      // Persist to Firestore for real-time UI updates (if enabled)
      const USE_FIRESTORE_DRAFTS = process.env.USE_FIRESTORE_DRAFTS === "true";
      let firestoreCardId: string | null = null;

      if (USE_FIRESTORE_DRAFTS && streamId) {
        try {
          const { createCard, Timestamp } =
            await import("@viralcue/shared/gcp");

          firestoreCardId = await createCard(userId, streamId, {
            status: "pending",
            viralScore: draft.confidence_score || 0.5,
            videoUrl: draft.video_url || "",
            thumbnailUrl: draft.thumbnail_url,
            aiAnalysis: {
              reasoning:
                draft.viral_reason || "AI detected potential viral content",
              category: draft.category || "general",
              momentDescription: draft.transcript_snippet,
            },
            draftPosts: {
              twitter: draft.content ? { text: draft.content } : undefined,
            },
            streamerId: userId,
          });

          console.log(
            `[Firestore] Created card ${firestoreCardId} for stream ${streamId}`
          );
        } catch (firestoreError) {
          console.error("[Firestore] Error creating card:", firestoreError);
          // Continue - PostgreSQL is the source of truth
        }
      }

      // Push the SAVED draft to the user via WebSocket (so they get it immediately)
      pushDraftToUser(userId, {
        id: savedDraft.id,
        firestoreId: firestoreCardId,
        draftType: savedDraft.draftType,
        content: savedDraft.content,
        confidenceScore: Number(savedDraft.confidenceScore),
        status: savedDraft.status,
        createdAt: savedDraft.createdAt.toISOString(),
        transcriptSnippet: savedDraft.transcriptSnippet,
        viralReason: draft.viral_reason,
        streamId: streamId,
      });
    }

    // Acknowledge the message
    message.ack();
  } catch (error) {
    console.error("[PubSub] Error processing message:", error);
    // Nack to allow retry
    message.nack();
  }
}

export function startDraftsConsumer(): void {
  if (isSubscribed) return;

  const client = getClient();
  subscription = client.subscription(DRAFTS_SUBSCRIPTION);

  subscription.on("message", handleMessage);

  subscription.on("error", (error: Error) => {
    console.error("[PubSub] Subscription error:", error);
  });

  isSubscribed = true;
  console.log(
    `[PubSub] Started drafts consumer on subscription: ${DRAFTS_SUBSCRIPTION}`
  );
}

export function stopDraftsConsumer(): void {
  if (subscription) {
    subscription.close();
    subscription = null;
  }
  isSubscribed = false;
  console.log("[PubSub] Stopped drafts consumer");
}
