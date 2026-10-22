import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  deriveAeadKeys,
  encryptSecret,
  hmacSha512,
  toHex,
} from "../src/server/lib/crypto";
import { verifySafepaySignature } from "../src/server/providers/safepay";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("token encryption (AES-GCM, AEAD)", () => {
  it("encrypts and decrypts round-trip", async () => {
    const secret = "cus_test_token_123";
    const bundle = await encryptSecret(secret, TEST_KEY);
    expect(bundle).not.toContain(secret);
    expect(await decryptSecret(bundle, TEST_KEY)).toBe(secret);
  });

  it("produces unique ciphertexts for identical plaintext", async () => {
    const a = await encryptSecret("same", TEST_KEY);
    const b = await encryptSecret("same", TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("derives a 32-byte encryption key from the base64 input", () => {
    const enc = deriveAeadKeys(TEST_KEY).encryption;
    expect(enc.byteLength).toBe(32);
  });

  it("rejects a non-32-byte key", () => {
    expect(() => deriveAeadKeys(Buffer.alloc(16, 1).toString("base64"))).toThrow();
  });

  it("fails to decrypt with a different key", async () => {
    const bundle = await encryptSecret("secret", TEST_KEY);
    const other = Buffer.alloc(32, 9).toString("base64");
    await expect(decryptSecret(bundle, other)).rejects.toThrow();
  });
});

describe("verifySafepaySignature (HMAC-SHA512 hex)", () => {
  it("accepts a correct signature", async () => {
    const secret = "webhook-shared-secret";
    const body = JSON.stringify({ token: "evt_1", type: "payment.succeeded" });
    const digest = await hmacSha512(secret, new TextEncoder().encode(body));
    const signature = toHex(digest);
    expect(await verifySafepaySignature(body, signature, secret)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const body = JSON.stringify({ token: "evt_1" });
    const digest = await hmacSha512("other-secret", new TextEncoder().encode(body));
    expect(await verifySafepaySignature(body, toHex(digest), "webhook-shared-secret")).toBe(false);
  });

  it("rejects a missing signature header", async () => {
    expect(await verifySafepaySignature("{}", null, "secret")).toBe(false);
  });
});
