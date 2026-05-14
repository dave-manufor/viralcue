/**
 * Crypto utilities with Cloud KMS integration.
 *
 * Provides encryption/decryption for sensitive data (OAuth tokens, etc.)
 * with fallback to local encryption for development.
 */
import crypto from "crypto";

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "viralcue-local";
const KMS_LOCATION = process.env.KMS_LOCATION || "us-central1";
const KMS_KEY_RING = process.env.KMS_KEY_RING || "viralcue-keys";
const KMS_KEY_NAME = process.env.KMS_KEY_NAME || "token-encryption-key";
const USE_CLOUD_KMS = process.env.USE_CLOUD_KMS === "true";

// Local encryption key (for development only)
const LOCAL_ENCRYPTION_KEY =
  process.env.LOCAL_ENCRYPTION_KEY || "dev-key-32-bytes-long-for-aes256!";

let kmsClient: any = null;

async function getKmsClient() {
  if (!kmsClient && USE_CLOUD_KMS) {
    const { KeyManagementServiceClient } = await import("@google-cloud/kms");
    kmsClient = new KeyManagementServiceClient();
  }
  return kmsClient;
}

/**
 * Encrypt data using Cloud KMS or local encryption.
 *
 * @param plaintext - The data to encrypt
 * @returns Base64-encoded encrypted data
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!USE_CLOUD_KMS) {
    return encryptLocal(plaintext);
  }

  const client = await getKmsClient();
  const keyName = `projects/${GCP_PROJECT_ID}/locations/${KMS_LOCATION}/keyRings/${KMS_KEY_RING}/cryptoKeys/${KMS_KEY_NAME}`;

  try {
    const [result] = await client.encrypt({
      name: keyName,
      plaintext: Buffer.from(plaintext, "utf8"),
    });

    return result.ciphertext.toString("base64");
  } catch (error) {
    console.error("[KMS] Encryption failed, falling back to local:", error);
    return encryptLocal(plaintext);
  }
}

/**
 * Decrypt data using Cloud KMS or local encryption.
 *
 * @param ciphertext - Base64-encoded encrypted data
 * @returns Decrypted plaintext
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!USE_CLOUD_KMS) {
    return decryptLocal(ciphertext);
  }

  const client = await getKmsClient();
  const keyName = `projects/${GCP_PROJECT_ID}/locations/${KMS_LOCATION}/keyRings/${KMS_KEY_RING}/cryptoKeys/${KMS_KEY_NAME}`;

  try {
    const [result] = await client.decrypt({
      name: keyName,
      ciphertext: Buffer.from(ciphertext, "base64"),
    });

    return result.plaintext.toString("utf8");
  } catch (error) {
    console.error("[KMS] Decryption failed, falling back to local:", error);
    return decryptLocal(ciphertext);
  }
}

/**
 * Local AES-256-GCM encryption for development.
 */
function encryptLocal(plaintext: string): string {
  const key = Buffer.from(LOCAL_ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Local AES-256-GCM decryption for development.
 */
function decryptLocal(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivB64, authTagB64, encryptedB64] = parts;
  const key = Buffer.from(LOCAL_ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypt an OAuth token for storage.
 */
export async function encryptToken(token: {
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
}): Promise<string> {
  const payload = JSON.stringify(token);
  return encrypt(payload);
}

/**
 * Decrypt an OAuth token from storage.
 */
export async function decryptToken(encryptedToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
}> {
  const payload = await decrypt(encryptedToken);
  const parsed = JSON.parse(payload);
  if (parsed.expiresAt) {
    parsed.expiresAt = new Date(parsed.expiresAt);
  }
  return parsed;
}

/**
 * Hash a value for comparison (non-reversible).
 */
export function hashValue(value: string, salt?: string): string {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(value, actualSalt, 100000, 64, "sha512")
    .toString("hex");
  return `${actualSalt}:${hash}`;
}

/**
 * Verify a value against a hash.
 */
export function verifyHash(value: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto
    .pbkdf2Sync(value, salt, 100000, 64, "sha512")
    .toString("hex");
  return hash === originalHash;
}
