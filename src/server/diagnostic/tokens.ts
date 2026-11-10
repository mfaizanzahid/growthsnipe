import type { Env } from "../types";

export type DiagnosticTokenPurpose = "connect" | "report";

interface TokenPayload {
  /** one_time_order_id the link belongs to. */
  o: string;
  /** Purpose: connect credentials or download the report. */
  p: DiagnosticTokenPurpose;
  /** Expiry, seconds since epoch. */
  e: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secretFor(env: Pick<Env, "DIAGNOSTIC_TOKEN_SECRET" | "BETTER_AUTH_SECRET">): string {
  const secret = env.DIAGNOSTIC_TOKEN_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim() || "";
  if (!secret) throw new Error("DIAGNOSTIC_TOKEN_SECRET is not configured");
  return secret;
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Sign a short-lived, single-purpose link token bound to a one-time order. */
export async function signDiagnosticToken(
  env: Pick<Env, "DIAGNOSTIC_TOKEN_SECRET" | "BETTER_AUTH_SECRET">,
  input: { orderId: string; purpose: DiagnosticTokenPurpose; ttlSeconds?: number; now?: number },
): Promise<string> {
  const now = input.now ?? Date.now();
  const payload: TokenPayload = {
    o: input.orderId,
    p: input.purpose,
    e: Math.floor(now / 1000) + (input.ttlSeconds ?? 90 * 24 * 60 * 60),
  };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(secretFor(env), body);
  return `${body}.${b64url(sig)}`;
}

/** Verify a token's signature, purpose, and expiry. Returns the order id. */
export async function verifyDiagnosticToken(
  env: Pick<Env, "DIAGNOSTIC_TOKEN_SECRET" | "BETTER_AUTH_SECRET">,
  token: string,
  purpose: DiagnosticTokenPurpose,
  now = Date.now(),
): Promise<string | null> {
  const [body, sigRaw] = token.split(".");
  if (!body || !sigRaw) return null;
  let expected: Uint8Array;
  try {
    expected = await hmac(secretFor(env), body);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, unb64url(sigRaw))) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(decoder.decode(unb64url(body))) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.o !== "string" || payload.o === "") return null;
  if (payload.p !== purpose) return null;
  if (typeof payload.e !== "number" || payload.e * 1000 < now) return null;
  return payload.o;
}
