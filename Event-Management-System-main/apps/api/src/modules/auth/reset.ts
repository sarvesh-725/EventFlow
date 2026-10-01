import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../http/errors.js";

function resetSecret(): string {
  if (!env.SESSION_SECRET) {
    throw new AppError(503, "AUTH_NOT_CONFIGURED", "Password recovery is not configured.");
  }
  return env.SESSION_SECRET;
}

function key(): Buffer {
  return createHash("sha256").update(resetSecret()).digest();
}

export function hashResetToken(token: string): string {
  return createHmac("sha256", resetSecret()).update(token).digest("hex");
}

export function encryptResetToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptResetToken(encrypted: string): string {
  const [ivPart, tagPart, ciphertextPart] = encrypted.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) throw new AppError(500, "RESET_TOKEN_INVALID", "The reset token payload is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}
