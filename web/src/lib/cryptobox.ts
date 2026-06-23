import crypto from "crypto";
import { encryptionKey } from "./config";

// AES-256-GCM encryption for secrets-at-rest (provider API keys in the file
// store). Demo runs without ceremony; prod gets real encryption keyed off
// ENCRYPTION_KEY / SESSION_SECRET. Ciphertext is self-describing with a prefix
// so we can detect and pass through already-plaintext / legacy values.
const PREFIX = "enc.v1.";

function keyBytes(): Buffer {
  // Derive a stable 32-byte key from the configured secret.
  return crypto.scryptSync(encryptionKey(), "tprm-settings-v1", 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  if (plain.startsWith(PREFIX)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) return stored; // plaintext / legacy value
  try {
    const [ivB, tagB, ctB] = stored.slice(PREFIX.length).split(".");
    const iv = Buffer.from(ivB, "base64url");
    const tag = Buffer.from(tagB, "base64url");
    const ct = Buffer.from(ctB, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return ""; // wrong key / corrupted — treat as unset rather than crash
  }
}
