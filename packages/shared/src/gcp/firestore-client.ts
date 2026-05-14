/**
 * Firestore Client with Emulator Support
 *
 * Automatically connects to emulator when FIRESTORE_EMULATOR_HOST is set.
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore, Timestamp } from "firebase-admin/firestore";

interface FirestoreClientOptions {
  projectId?: string;
}

// Singleton app and firestore instances
let firebaseApp: App | null = null;
let firestoreClient: Firestore | null = null;

/**
 * Get or create the Firestore client
 */
export function getFirestoreClient(
  options?: FirestoreClientOptions
): Firestore {
  if (!firestoreClient) {
    const projectId =
      options?.projectId || process.env.GCP_PROJECT_ID || "viralcue-local";
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

    // Initialize Firebase Admin if not already done
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        projectId,
      });
    } else {
      firebaseApp = getApps()[0];
    }

    firestoreClient = getFirestore(firebaseApp);

    console.log(
      `[Firestore] Connected to ${emulatorHost ? "emulator" : "production"} (project: ${projectId})`
    );
  }

  return firestoreClient;
}

/**
 * Card document structure for the Tinder-style interface
 */
export interface CardDocument {
  status: "pending" | "approved" | "rejected";
  viralScore: number;
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: Timestamp;
  aiAnalysis: {
    reasoning: string;
    category: string;
    momentDescription?: string;
    recommendedCrop?: "16:9" | "9:16" | "1:1";
    timestamps?: {
      startCut: string;
      endCut: string;
    };
  };
  draftPosts: {
    twitter?: {
      text: string;
      mediaId?: string;
    };
    tiktok?: {
      caption: string;
      hashtags: string[];
    };
    instagram?: {
      caption: string;
      hashtags: string[];
    };
  };
  streamerId?: string;
}

/**
 * Get cards collection for a specific stream
 * Path: users/{userId}/streams/{streamId}/cards
 */
export function getStreamCardsCollection(userId: string, streamId: string) {
  const firestore = getFirestoreClient();
  return firestore.collection(`users/${userId}/streams/${streamId}/cards`);
}

/**
 * Create a new card for a stream
 */
export async function createCard(
  userId: string,
  streamId: string,
  card: Omit<CardDocument, "createdAt">
): Promise<string> {
  const collection = getStreamCardsCollection(userId, streamId);

  const docRef = await collection.add({
    ...card,
    createdAt: Timestamp.now(),
  });

  return docRef.id;
}

/**
 * Update a card's status
 */
export async function updateCardStatus(
  userId: string,
  streamId: string,
  cardId: string,
  status: CardDocument["status"]
): Promise<void> {
  const collection = getStreamCardsCollection(userId, streamId);
  await collection.doc(cardId).update({ status });
}

/**
 * Get pending cards for a stream
 */
export async function getPendingCards(
  userId: string,
  streamId: string,
  limit: number = 10
): Promise<Array<CardDocument & { id: string }>> {
  const collection = getStreamCardsCollection(userId, streamId);

  const snapshot = await collection
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as CardDocument),
  }));
}

/**
 * Get all pending cards across all streams for a user
 */
export async function getAllPendingCardsForUser(
  userId: string,
  limit: number = 20
): Promise<Array<CardDocument & { id: string; streamId: string }>> {
  const firestore = getFirestoreClient();

  // Use collection group query to get cards across all streams
  const snapshot = await firestore
    .collectionGroup("cards")
    .where("status", "==", "pending")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  // Filter to only this user's cards and extract streamId from path
  return snapshot.docs
    .filter((doc) => doc.ref.path.startsWith(`users/${userId}/`))
    .map((doc) => {
      // Path: users/{userId}/streams/{streamId}/cards/{cardId}
      const pathParts = doc.ref.path.split("/");
      const streamId = pathParts[3]; // Index 3 is streamId
      return {
        id: doc.id,
        streamId,
        ...(doc.data() as CardDocument),
      };
    });
}

/**
 * Delete a card
 */
export async function deleteCard(
  userId: string,
  streamId: string,
  cardId: string
): Promise<void> {
  const collection = getStreamCardsCollection(userId, streamId);
  await collection.doc(cardId).delete();
}

/**
 * Collection paths used in ViralCue
 */
export const Collections = {
  getStreamCards: (userId: string, streamId: string) =>
    `users/${userId}/streams/${streamId}/cards`,
} as const;

export { Timestamp };
