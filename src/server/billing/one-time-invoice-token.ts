import type { Env } from "../types";
import { hmacSha512, toHex } from "../lib/crypto";

interface InvoiceTokenPayload {
  /** one_time_orders.id */
  o: string;
  /** one_time_invoices.id */
  i: string;
  /** Expiry, seconds since epoch. */
  e: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secretFor(env: Pick<Env, "BETTER_AUTH_SECRET">): string {
  const secret = env.BETTER_AUTH_SECRET?.trim() || "";
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured");
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

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sign a long-lived invoice download link bound to both the order and invoice. */
export async function signOneTimeInvoiceToken(
  env: Pick<Env, "BETTER_AUTH_SECRET">,
  input: { orderId: string; invoiceId: string; ttlSeconds?: number; now?: number },
): Promise<string> {
  const now = input.now ?? Date.now();
  const payload: InvoiceTokenPayload = {
    o: input.orderId,
    i: input.invoiceId,
    e: Math.floor(now / 1000) + (input.ttlSeconds ?? 365 * 24 * 60 * 60),
  };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = toHex(await hmacSha512(secretFor(env), encoder.encode(body)));
  return `${body}.${sig}`;
}

export async function verifyOneTimeInvoiceToken(
  env: Pick<Env, "BETTER_AUTH_SECRET">,
  token: string,
  now = Date.now(),
): Promise<{ orderId: string; invoiceId: string } | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = toHex(await hmacSha512(secretFor(env), encoder.encode(body)));
  } catch {
    return null;
  }
  if (!timingSafeEqualHex(expected, sig)) return null;
  let payload: InvoiceTokenPayload;
  try {
    payload = JSON.parse(decoder.decode(unb64url(body))) as InvoiceTokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.o !== "string" || payload.o === "") return null;
  if (typeof payload.i !== "string" || payload.i === "") return null;
  if (typeof payload.e !== "number" || payload.e * 1000 < now) return null;
  return { orderId: payload.o, invoiceId: payload.i };
}
