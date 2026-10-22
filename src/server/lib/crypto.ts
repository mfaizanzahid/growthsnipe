const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SIGNING_KEY_LENGTH = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface AeadKeys {
  encryption: Uint8Array;
  signing: Uint8Array;
}

export function deriveAeadKeys(keyB64: string): AeadKeys {
  const raw = Buffer.from(keyB64, "base64");
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  const enc = new Uint8Array(raw.byteLength);
  enc.set(raw);
  return { encryption: enc, signing: new Uint8Array(SIGNING_KEY_LENGTH) };
}

export async function encryptSecret(plainText: string, keyB64: string): Promise<string> {
  const keys = deriveAeadKeys(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keys.encryption),
    { name: ALGORITHM },
    false,
    ["encrypt"],
  );
  const cipher = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 },
    key,
    encoder.encode(plainText),
  );
  const cipherBytes = new Uint8Array(cipher);
  const sig = await hmacSha256(
    keys.signing,
    iv,
    cipherBytes.subarray(0, cipherBytes.byteLength - AUTH_TAG_LENGTH),
  );
  return bundle(iv, cipherBytes, sig);
}

export async function decryptSecret(bundleB64: string, keyB64: string): Promise<string> {
  const keys = deriveAeadKeys(keyB64);
  const { iv, body, tag, signature } = unbundle(bundleB64);

  const expected = await hmacSha256(keys.signing, iv, body);
  if (!constantTimeEqual(expected, signature)) {
    throw new Error("Invalid ciphertext signature");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keys.encryption),
    { name: ALGORITHM },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: toArrayBuffer(iv), tagLength: AUTH_TAG_LENGTH * 8 },
    key,
    toArrayBuffer(concat(body, tag)),
  );
  return decoder.decode(plain);
}

export async function hmacSha512(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, toArrayBuffer(data));
  return new Uint8Array(sig);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return toHex(new Uint8Array(digest));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(
  key: Uint8Array,
  a: Uint8Array,
  b?: Uint8Array,
): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = b === undefined ? a : concat(a, b);
  const sig = await crypto.subtle.sign("HMAC", k, toArrayBuffer(data));
  return new Uint8Array(sig);
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function bundle(iv: Uint8Array, full: Uint8Array, signature: Uint8Array): string {
  const body = full.subarray(0, full.byteLength - AUTH_TAG_LENGTH);
  const tag = full.subarray(full.byteLength - AUTH_TAG_LENGTH);
  const all = new Uint8Array(iv.byteLength + body.byteLength + tag.byteLength + signature.byteLength);
  let off = 0;
  all.set(iv, off); off += iv.byteLength;
  all.set(body, off); off += body.byteLength;
  all.set(tag, off); off += tag.byteLength;
  all.set(signature, off);
  return Buffer.from(all).toString("base64");
}

function unbundle(bundleB64: string): {
  iv: Uint8Array;
  body: Uint8Array;
  tag: Uint8Array;
  signature: Uint8Array;
} {
  const all = new Uint8Array(Buffer.from(bundleB64, "base64"));
  const bodyLen = all.byteLength - IV_LENGTH - AUTH_TAG_LENGTH - SIGNING_KEY_LENGTH;
  const iv = all.slice(0, IV_LENGTH);
  const body = all.slice(IV_LENGTH, IV_LENGTH + bodyLen);
  const tag = all.slice(IV_LENGTH + bodyLen, IV_LENGTH + bodyLen + AUTH_TAG_LENGTH);
  const signature = all.slice(IV_LENGTH + bodyLen + AUTH_TAG_LENGTH);
  return { iv, body, tag, signature };
}

// --- Tradesmatic helpers (V1 market test) ---
// JSON credential envelope encrypted with MCP_ENCRYPTION_KEY.
// Kept alongside the billing AEAD helpers; billing paths keep using
// encryptSecret/decryptSecret with TOKEN_ENCRYPTION_KEY.

function sidekickKeyBytes(secret: string): Uint8Array {
  return encoder.encode(secret.padEnd(32, "0")).slice(0, 32);
}

export async function encryptJson(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(sidekickKeyBytes(secret)), "AES-GCM", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return `${sidekickB64(iv)}.${sidekickB64(new Uint8Array(ct))}`;
}

export async function decryptJson<T>(secret: string, packed: string): Promise<T> {
  const [ivRaw, dataRaw] = packed.split(".");
  if (!ivRaw || !dataRaw) throw new Error("Invalid encrypted payload");
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(sidekickKeyBytes(secret)), "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sidekickUb64(ivRaw) }, key, sidekickUb64(dataRaw));
  return JSON.parse(decoder.decode(pt)) as T;
}

function sidekickB64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sidekickUb64(s: string) {
  const n = s.replace(/-/g, "+").replace(/_/g, "/");
  const p = n + "=".repeat((4 - (n.length % 4)) % 4);
  const b = atob(p);
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
