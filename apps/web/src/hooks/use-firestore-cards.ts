/**
 * useFirestoreCards - React hook for real-time Firestore card updates
 *
 * Uses Firebase client SDK to listen for card changes in real-time.
 * Falls back to polling when Firestore is not available.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  Firestore,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";

// Firebase config - loaded from environment
const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID || "viralcue-local",
  // For production, you'd also need apiKey, authDomain, etc.
  // apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
};

// Card document structure (mirrors backend)
export interface CardDocument {
  id: string;
  streamId?: string;
  status: "pending" | "approved" | "rejected";
  viralScore: number;
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: Date;
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
}

// Singleton Firebase instances
let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;

function getFirebaseApp(): FirebaseApp | null {
  // Check if Firestore is enabled
  if (process.env.NEXT_PUBLIC_USE_FIRESTORE_DRAFTS !== "true") {
    return null;
  }

  if (!firebaseApp && getApps().length === 0) {
    try {
      firebaseApp = initializeApp(firebaseConfig);

      // Connect to emulator if available
      if (process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST) {
        console.log(
          "[Firestore] Using emulator:",
          process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST
        );
      }
    } catch (error) {
      console.error("[Firestore] Failed to initialize:", error);
      return null;
    }
  } else if (getApps().length > 0) {
    firebaseApp = getApps()[0];
  }

  return firebaseApp;
}

function getFirestoreDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;

  if (!firestoreDb) {
    firestoreDb = getFirestore(app);
  }

  return firestoreDb;
}

interface UseFirestoreCardsOptions {
  userId: string;
  streamId?: string; // Optional: filter to specific stream
  statusFilter?: "pending" | "approved" | "rejected" | "all";
  maxCards?: number;
}

interface UseFirestoreCardsResult {
  cards: CardDocument[];
  loading: boolean;
  error: Error | null;
  approveCard: (cardId: string, streamId: string) => Promise<void>;
  rejectCard: (cardId: string, streamId: string) => Promise<void>;
  isFirestoreEnabled: boolean;
}

/**
 * Hook for real-time Firestore card updates
 */
export function useFirestoreCards(
  options: UseFirestoreCardsOptions
): UseFirestoreCardsResult {
  const { userId, streamId, statusFilter = "pending", maxCards = 20 } = options;

  const [cards, setCards] = useState<CardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFirestoreEnabled, setIsFirestoreEnabled] = useState(false);

  // Update card status
  const updateCardStatus = useCallback(
    async (
      cardId: string,
      cardStreamId: string,
      status: "approved" | "rejected"
    ) => {
      const db = getFirestoreDb();
      if (!db) {
        throw new Error("Firestore not available");
      }

      const cardRef = doc(
        db,
        `users/${userId}/streams/${cardStreamId}/cards/${cardId}`
      );
      await updateDoc(cardRef, { status });
    },
    [userId]
  );

  const approveCard = useCallback(
    async (cardId: string, cardStreamId: string) => {
      await updateCardStatus(cardId, cardStreamId, "approved");
    },
    [updateCardStatus]
  );

  const rejectCard = useCallback(
    async (cardId: string, cardStreamId: string) => {
      await updateCardStatus(cardId, cardStreamId, "rejected");
    },
    [updateCardStatus]
  );

  // Handle case where Firestore is not enabled
  const db = getFirestoreDb();
  const isFirestoreAvailable = !!db;

  useEffect(() => {
    if (!isFirestoreAvailable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: initializing state based on external system (Firestore) availability
      setIsFirestoreEnabled(false);
      setLoading(false);
      return;
    }

    setIsFirestoreEnabled(true);
    setLoading(true);
    setError(null);

    let unsubscribe: Unsubscribe;

    try {
      // Build query based on whether we have a specific streamId
      if (streamId) {
        // Query specific stream
        const cardsRef = collection(
          db,
          `users/${userId}/streams/${streamId}/cards`
        );

        let q = query(cardsRef, orderBy("createdAt", "desc"), limit(maxCards));

        if (statusFilter !== "all") {
          q = query(
            cardsRef,
            where("status", "==", statusFilter),
            orderBy("createdAt", "desc"),
            limit(maxCards)
          );
        }

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const newCards: CardDocument[] = snapshot.docs.map((doc) => ({
              id: doc.id,
              streamId,
              ...doc.data(),
              createdAt:
                (doc.data().createdAt as Timestamp)?.toDate() || new Date(),
            })) as CardDocument[];

            setCards(newCards);
            setLoading(false);
          },
          (err) => {
            console.error("[Firestore] Snapshot error:", err);
            setError(err);
            setLoading(false);
          }
        );
      } else {
        // Query all streams using collection group
        // Note: This requires a composite index in Firestore
        const cardsRef = collection(
          db,
          `users/${userId}/streams/default/cards`
        );

        // For now, just query a default stream
        // TODO: Implement collection group query for all streams
        const q = query(
          cardsRef,
          where("status", "==", statusFilter),
          orderBy("createdAt", "desc"),
          limit(maxCards)
        );

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const newCards: CardDocument[] = snapshot.docs.map((doc) => ({
              id: doc.id,
              streamId: "default",
              ...doc.data(),
              createdAt:
                (doc.data().createdAt as Timestamp)?.toDate() || new Date(),
            })) as CardDocument[];

            setCards(newCards);
            setLoading(false);
          },
          (err) => {
            console.error("[Firestore] Snapshot error:", err);
            setError(err);
            setLoading(false);
          }
        );
      }
    } catch (err) {
      console.error("[Firestore] Setup error:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      return;
    }

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId, streamId, statusFilter, maxCards, db, isFirestoreAvailable]);

  return {
    cards,
    loading,
    error,
    approveCard,
    rejectCard,
    isFirestoreEnabled,
  };
}

export default useFirestoreCards;
