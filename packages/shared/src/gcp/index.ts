/**
 * GCP Shared Client Exports
 */

// Pub/Sub
export {
  getPubSubClient,
  publishMessage,
  createSubscription,
  Topics,
  Subscriptions,
  type TopicName,
  type SubscriptionName,
} from "./pubsub-client";

// Cloud Storage
export {
  getStorageClient,
  uploadFile,
  getSignedUrl,
  downloadFile,
  deleteFile,
  fileExists,
  Buckets,
  type BucketName,
} from "./storage-client";

// Firestore
export {
  getFirestoreClient,
  getStreamCardsCollection,
  createCard,
  updateCardStatus,
  getPendingCards,
  getAllPendingCardsForUser,
  deleteCard,
  Collections,
  Timestamp,
  type CardDocument,
} from "./firestore-client";
