import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Parents' AI keys are encrypted (AES-256-GCM) before they go in the database,
// with a secret that only the website's server knows (AI_KEY_SECRET).
// A database leak alone doesn't reveal anyone's key.

function secretKey() {
  const secret = process.env.AI_KEY_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AI_KEY_SECRET is missing. Add it to .env.local and to Vercel's environment variables.");
  }
  return createHash("sha256").update(`family-arcade-ai-key:${secret}`).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(stored: string) {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Stored AI key is unreadable.");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** "…a1b2" so parents can recognise which key is connected, without showing it. */
export function keyHint(key: string) {
  return `…${key.trim().slice(-4)}`;
}
