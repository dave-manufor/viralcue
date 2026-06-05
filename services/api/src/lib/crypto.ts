import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX =
  process.env.TOKEN_ENCRYPTION_KEY ||
  "f6d83cf932bb8fe0a43063f25c78b66e60b1359d4c2b9fce63b4b5e0ee4a2754";
const KEY = Buffer.from(KEY_HEX, "hex");

export function encrypt(text: string | null): string | null {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error("Encryption failed:", error);
    return text;
  }
}

export function decrypt(encryptedText: string | null): string | null {
  if (!encryptedText) return encryptedText;
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      // Return original text if it is not in our encrypted format
      return encryptedText;
    }
    const [ivHex, authTagHex, encryptedContentHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedContentHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    // If decryption fails, log it and return the original text (fallback)
    console.warn("Decryption failed, returning raw value:", error);
    return encryptedText;
  }
}
