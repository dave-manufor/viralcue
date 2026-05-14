/**
 * SQS Consumer - Polls viralcue-drafts queue and pushes to Socket.IO
 */
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { pushDraftToUser } from "../websocket/dashboard";

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || "";
const DRAFTS_QUEUE = process.env.DRAFTS_QUEUE || "viralcue-drafts";

let sqsClient: SQSClient | null = null;
let queueUrl: string | null = null;
let isPolling = false;

function getClient(): SQSClient {
  if (!sqsClient) {
    const config: any = { region: AWS_REGION };
    if (AWS_ENDPOINT_URL) {
      config.endpoint = AWS_ENDPOINT_URL;
      config.credentials = {
        accessKeyId: "test",
        secretAccessKey: "test",
      };
    }
    sqsClient = new SQSClient(config);
  }
  return sqsClient;
}

async function getQueueUrl(): Promise<string> {
  if (!queueUrl) {
    const { GetQueueUrlCommand } = await import("@aws-sdk/client-sqs");
    const response = await getClient().send(
      new GetQueueUrlCommand({ QueueName: DRAFTS_QUEUE })
    );
    queueUrl = response.QueueUrl!;
  }
  return queueUrl;
}

async function pollDrafts(): Promise<void> {
  const client = getClient();
  const url = await getQueueUrl();

  while (isPolling) {
    try {
      const response = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: url,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // Long polling (max) for event-driven behavior
        })
      );

      for (const msg of response.Messages || []) {
        try {
          const body = JSON.parse(msg.Body!);
          const { userId, draft } = body;

          if (userId && draft) {
            console.log(`[SQS] Received draft for user ${userId}`);

            // Persist to Database
            const { prisma } = await import("@viralcue/db");

            // Map string type to Enum
            // Map string type to Enum
            let draftType = "CHAT_MESSAGE";
            if (
              draft.draft_type === "SHORT_VIDEO" ||
              draft.draft_type === "CLIP"
            )
              draftType = "SHORT_VIDEO";
            else if (
              draft.draft_type === "THREAD" ||
              draft.draft_type === "TWEET"
            )
              draftType = "THREAD";
            else if (draft.draft_type === "AFFILIATE") draftType = "AFFILIATE";

            const savedDraft = await prisma.draft.create({
              data: {
                sessionId: draft.session_id,
                draftType: draftType as any,
                content: draft.content,
                confidenceScore: draft.confidence_score,
                transcriptSnippet: draft.transcript_snippet,
              },
            });

            console.log(`[SQS] Persisted draft ${savedDraft.id}`);

            // Push the SAVED draft to the user (so it has ID and timestamp)
            pushDraftToUser(userId, {
              id: savedDraft.id,
              draftType: savedDraft.draftType,
              content: savedDraft.content,
              confidenceScore: Number(savedDraft.confidenceScore), // Ensure number
              status: savedDraft.status,
              createdAt: savedDraft.createdAt.toISOString(),
              transcriptSnippet: savedDraft.transcriptSnippet,
              viralReason: draft.viral_reason,
            });
          }

          // Delete processed message
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: url,
              ReceiptHandle: msg.ReceiptHandle!,
            })
          );
        } catch (parseError) {
          console.error("[SQS] Error parsing message:", parseError);
        }
      }
    } catch (error) {
      console.error("[SQS] Error polling drafts:", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export function startDraftsConsumer(): void {
  if (isPolling) return;
  isPolling = true;
  console.log("[SQS] Starting drafts consumer...");
  pollDrafts().catch(console.error);
}

export function stopDraftsConsumer(): void {
  isPolling = false;
  console.log("[SQS] Stopping drafts consumer");
}
