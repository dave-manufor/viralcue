/**
 * GCP Pub/Sub Client with Emulator Support
 *
 * Automatically connects to emulator when PUBSUB_EMULATOR_HOST is set.
 */

import { PubSub, Topic, Subscription, Message } from "@google-cloud/pubsub";

interface PubSubClientOptions {
  projectId?: string;
}

interface PublishOptions {
  orderingKey?: string;
  attributes?: Record<string, string>;
}

// Singleton client instance
let pubsubClient: PubSub | null = null;

/**
 * Get or create the Pub/Sub client
 */
export function getPubSubClient(options?: PubSubClientOptions): PubSub {
  if (!pubsubClient) {
    const projectId =
      options?.projectId || process.env.GCP_PROJECT_ID || "viralcue-local";

    pubsubClient = new PubSub({
      projectId,
      // Emulator is automatically detected via PUBSUB_EMULATOR_HOST
    });

    const isEmulator = !!process.env.PUBSUB_EMULATOR_HOST;
    console.log(
      `[PubSub] Connected to ${isEmulator ? "emulator" : "production"} (project: ${projectId})`
    );
  }

  return pubsubClient;
}

/**
 * Publish a message to a topic
 */
export async function publishMessage<T extends object>(
  topicName: string,
  data: T,
  options?: PublishOptions
): Promise<string> {
  const client = getPubSubClient();
  const topic = client.topic(topicName);

  const messageBuffer = Buffer.from(JSON.stringify(data));

  const messageId = await topic.publishMessage({
    data: messageBuffer,
    orderingKey: options?.orderingKey,
    attributes: options?.attributes,
  });

  return messageId;
}

/**
 * Create a subscription consumer
 */
export function createSubscription(
  subscriptionName: string,
  messageHandler: (message: Message, data: unknown) => Promise<void>,
  options?: {
    autoAck?: boolean;
    maxMessages?: number;
    ackDeadlineSeconds?: number;
  }
): Subscription {
  const client = getPubSubClient();
  const subscription = client.subscription(subscriptionName, {
    flowControl: {
      maxMessages: options?.maxMessages ?? 10,
    },
    ackDeadline: options?.ackDeadlineSeconds ?? 60,
  });

  subscription.on("message", async (message: Message) => {
    try {
      const data = JSON.parse(message.data.toString());
      await messageHandler(message, data);

      if (options?.autoAck !== false) {
        message.ack();
      }
    } catch (error) {
      console.error(`[PubSub] Error processing message ${message.id}:`, error);
      message.nack();
    }
  });

  subscription.on("error", (error: Error) => {
    console.error("[PubSub] Subscription error:", error);
  });

  console.log(`[PubSub] Listening on subscription: ${subscriptionName}`);

  return subscription;
}

/**
 * Topic names used in ViralCue
 */
export const Topics = {
  AUDIO_CHUNKS: "viralcue-audio-chunks",
  TRANSCRIPTS: "viralcue-transcripts",
  VIRAL_CANDIDATES: "viralcue-viral-candidates",
  CLIP_DOWNLOADED: "viralcue-clip-downloaded",
  DRAFTS: "viralcue-drafts",
  CARD_APPROVED: "viralcue-card-approved",
  AFFILIATE_TRIGGER: "viralcue-affiliate-trigger",
  // Dead letter topics
  AUDIO_CHUNKS_DLQ: "viralcue-audio-chunks-dlq",
  TRANSCRIPTS_DLQ: "viralcue-transcripts-dlq",
  VIRAL_CANDIDATES_DLQ: "viralcue-viral-candidates-dlq",
} as const;

/**
 * Subscription names used in ViralCue
 */
export const Subscriptions = {
  AUDIO_PROCESSOR: "audio-processor-sub",
  AI_ENGINE: "ai-engine-sub",
  SNIPER: "sniper-sub",
  DIRECTOR: "director-sub",
  DASHBOARD: "dashboard-sub",
  PUBLISHER: "publisher-sub",
  AFFILIATE: "affiliate-sub",
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];
export type SubscriptionName =
  (typeof Subscriptions)[keyof typeof Subscriptions];
