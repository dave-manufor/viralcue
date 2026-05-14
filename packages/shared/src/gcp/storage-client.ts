/**
 * GCP Cloud Storage Client with Emulator Support
 *
 * Automatically connects to fake-gcs-server when STORAGE_EMULATOR_HOST is set.
 */

import {
  Storage,
  Bucket,
  File,
  GetSignedUrlConfig,
} from "@google-cloud/storage";

interface StorageClientOptions {
  projectId?: string;
}

// Singleton client instance
let storageClient: Storage | null = null;

/**
 * Get or create the Storage client
 */
export function getStorageClient(options?: StorageClientOptions): Storage {
  if (!storageClient) {
    const projectId =
      options?.projectId || process.env.GCP_PROJECT_ID || "viralcue-local";
    const emulatorHost = process.env.STORAGE_EMULATOR_HOST;

    const clientOptions: ConstructorParameters<typeof Storage>[0] = {
      projectId,
    };

    // Configure for emulator if STORAGE_EMULATOR_HOST is set
    if (emulatorHost) {
      clientOptions.apiEndpoint = emulatorHost;
    }

    storageClient = new Storage(clientOptions);

    console.log(
      `[GCS] Connected to ${emulatorHost ? "emulator" : "production"} (project: ${projectId})`
    );
  }

  return storageClient;
}

/**
 * Upload a file to GCS
 */
export async function uploadFile(
  bucketName: string,
  fileName: string,
  data: Buffer | string,
  options?: {
    contentType?: string;
    metadata?: Record<string, string>;
    public?: boolean;
  }
): Promise<{ url: string; bucket: string; name: string }> {
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  await file.save(data, {
    contentType: options?.contentType || "application/octet-stream",
    metadata: options?.metadata,
    public: options?.public ?? false,
  });

  const emulatorHost = process.env.STORAGE_EMULATOR_HOST;
  const url = emulatorHost
    ? `${emulatorHost}/${bucketName}/${fileName}`
    : `https://storage.googleapis.com/${bucketName}/${fileName}`;

  return {
    url,
    bucket: bucketName,
    name: fileName,
  };
}

/**
 * Generate a signed URL for file access
 */
export async function getSignedUrl(
  bucketName: string,
  fileName: string,
  options?: {
    expiresInMinutes?: number;
    action?: "read" | "write";
    contentType?: string;
  }
): Promise<string> {
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  const expiresInMinutes = options?.expiresInMinutes ?? 60;
  const expires = Date.now() + expiresInMinutes * 60 * 1000;

  const config: GetSignedUrlConfig = {
    version: "v4",
    action: options?.action ?? "read",
    expires,
    contentType: options?.contentType,
  };

  const [signedUrl] = await file.getSignedUrl(config);

  return signedUrl;
}

/**
 * Download a file from GCS
 */
export async function downloadFile(
  bucketName: string,
  fileName: string
): Promise<Buffer> {
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  const [data] = await file.download();

  return data;
}

/**
 * Delete a file from GCS
 */
export async function deleteFile(
  bucketName: string,
  fileName: string
): Promise<void> {
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  await file.delete();
}

/**
 * Check if a file exists
 */
export async function fileExists(
  bucketName: string,
  fileName: string
): Promise<boolean> {
  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);

  const [exists] = await file.exists();
  return exists;
}

/**
 * Bucket names used in ViralCue
 */
export const Buckets = {
  RAW_CLIPS: "viralcue-raw-clips",
  PROCESSED_CLIPS: "viralcue-processed-clips",
  THUMBNAILS: "viralcue-thumbnails",
} as const;

export type BucketName = (typeof Buckets)[keyof typeof Buckets];
