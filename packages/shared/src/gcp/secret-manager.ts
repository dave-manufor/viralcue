/**
 * Secret Manager Client - TypeScript wrapper for GCP Secret Manager
 *
 * Provides secure credential retrieval with local development fallback.
 */
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "viralcue-local";
const USE_SECRET_MANAGER = process.env.USE_SECRET_MANAGER === "true";

let client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

/**
 * Get a secret value from Secret Manager or environment variable.
 *
 * @param secretId - The secret ID in Secret Manager
 * @param envFallback - Environment variable name for local fallback
 * @param version - Version to retrieve (default: "latest")
 * @returns The secret value
 */
export async function getSecret(
  secretId: string,
  envFallback?: string,
  version: string = "latest"
): Promise<string> {
  // Local development fallback
  if (!USE_SECRET_MANAGER) {
    const envVar = envFallback || secretId.toUpperCase().replace(/-/g, "_");
    const value = process.env[envVar] || "";
    if (!value) {
      console.warn(`[SecretManager] Warning: ${envVar} not set in environment`);
    }
    return value;
  }

  const name = `projects/${PROJECT_ID}/secrets/${secretId}/versions/${version}`;

  try {
    const [response] = await getClient().accessSecretVersion({ name });
    return response.payload?.data?.toString() || "";
  } catch (error) {
    console.error(`[SecretManager] Error accessing ${secretId}:`, error);
    // Fallback to environment variable
    const envVar = envFallback || secretId.toUpperCase().replace(/-/g, "_");
    return process.env[envVar] || "";
  }
}

/**
 * Create a new secret (for initialization/migration).
 */
export async function createSecret(
  secretId: string,
  secretValue: string
): Promise<boolean> {
  if (!USE_SECRET_MANAGER) {
    console.log(`[SecretManager] Skipping create in local mode: ${secretId}`);
    return true;
  }

  const parent = `projects/${PROJECT_ID}`;

  try {
    // Create the secret
    await getClient().createSecret({
      parent,
      secretId,
      secret: { replication: { automatic: {} } },
    });

    // Add the secret version
    const secretName = `${parent}/secrets/${secretId}`;
    await getClient().addSecretVersion({
      parent: secretName,
      payload: { data: Buffer.from(secretValue, "utf8") },
    });

    console.log(`[SecretManager] Created secret: ${secretId}`);
    return true;
  } catch (error: any) {
    if (error.message?.includes("already exists")) {
      console.log(`[SecretManager] Secret ${secretId} already exists`);
      return true;
    }
    console.error(`[SecretManager] Error creating ${secretId}:`, error);
    return false;
  }
}

// Convenience functions for common secrets
const secretCache: Map<string, string> = new Map();

async function getCachedSecret(
  secretId: string,
  envFallback: string
): Promise<string> {
  if (secretCache.has(secretId)) {
    return secretCache.get(secretId)!;
  }
  const value = await getSecret(secretId, envFallback);
  secretCache.set(secretId, value);
  return value;
}

export const getTwitchClientId = () =>
  getCachedSecret("twitch-client-id", "TWITCH_CLIENT_ID");

export const getTwitchClientSecret = () =>
  getCachedSecret("twitch-client-secret", "TWITCH_CLIENT_SECRET");

export const getDeepgramApiKey = () =>
  getCachedSecret("deepgram-api-key", "DEEPGRAM_API_KEY");

export const getClerkSecretKey = () =>
  getCachedSecret("clerk-secret-key", "CLERK_SECRET_KEY");

export function clearSecretCache(): void {
  secretCache.clear();
}
