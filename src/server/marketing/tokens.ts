import { hmacSha512, toHex } from "../lib/crypto";

/**
 * Unsubscribe + library-access tokens: `base64url(leadId).hex(HMAC(secret, leadId))`.
 * Workers-safe (Web Crypto only). Verification recomputes the tag with a
 * constant-time comparison so token validity is not enumerable by timing.
 */
/** Lead ids are ASCII (UUIDs), so btoa/atob are safe (no Buffer in Worker code). */
export function encodeLeadId(leadId: string): string {
  return btoa(leadId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeLeadId(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return atob(padded);
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signLeadId(secret: string, leadId: string): Promise<string> {
  const tag = toHex(await hmacSha512(secret, new TextEncoder().encode(leadId)));
  return `${encodeLeadId(leadId)}.${tag}`;
}

export async function verifyLeadToken(secret: string, token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const leadId = decodeLeadId(token.slice(0, dot));
  if (!leadId) return null;
  const expected = toHex(await hmacSha512(secret, new TextEncoder().encode(leadId)));
  if (!timingSafeEqual(expected, token.slice(dot + 1))) return null;
  return leadId;
}
