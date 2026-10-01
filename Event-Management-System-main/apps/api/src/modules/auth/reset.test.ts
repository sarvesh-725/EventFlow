import { describe, expect, it } from "vitest";

describe("password reset token protection", () => {
  it("hashes tokens and can decrypt only the encrypted server payload", async () => {
    process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
    const { decryptResetToken, encryptResetToken, hashResetToken } = await import("./reset.js");
    const raw = "reset-token-value";
    const encrypted = encryptResetToken(raw);

    expect(decryptResetToken(encrypted)).toBe(raw);
    expect(hashResetToken(raw)).not.toBe(hashResetToken("different-token"));
  });
});
