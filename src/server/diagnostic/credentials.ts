import { eq } from "drizzle-orm";
import type { Db } from "../repositories/db";
import { diagnosticCredentials } from "../db/schema";
import { encryptJson, decryptJson } from "../lib/crypto";
import { createProviderAdapter } from "../providers/registry";
import type { Env } from "../types";
import type { DiagnosticProvider } from "./types";

export type DiagnosticCredentialMap = Record<string, string>;

function encryptionKey(env: Pick<Env, "MCP_ENCRYPTION_KEY">): string {
  const key = env.MCP_ENCRYPTION_KEY?.trim();
  if (!key) throw new Error("MCP_ENCRYPTION_KEY is required to store diagnostic credentials");
  return key;
}

/** ISN needs these fields; Spectora needs an API key. Empty values are rejected. */
export function normalizeCredentials(
  provider: DiagnosticProvider,
  input: Record<string, unknown>,
): DiagnosticCredentialMap {
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return "";
  };
  if (provider === "isn") {
    const companyKey = pick("companyKey", "company_key");
    const host = pick("host", "domain");
    const accessKey = pick("accessKey", "access_key");
    const secretKey = pick("secretKey", "secret_key");
    if (!companyKey || !host || !accessKey || !secretKey) {
      throw new Error("ISN needs company key, host, access key, and secret key");
    }
    return { companyKey, host, accessKey, secretKey };
  }
  const apiKey = pick("apiKey", "api_key");
  if (!apiKey) throw new Error("Spectora needs an API key");
  return { apiKey };
}

export async function saveCredentials(
  db: Db,
  env: Pick<Env, "MCP_ENCRYPTION_KEY">,
  runId: string,
  provider: DiagnosticProvider,
  credentials: DiagnosticCredentialMap,
  now = Date.now(),
): Promise<void> {
  const encrypted = await encryptJson(encryptionKey(env), credentials);
  await db
    .insert(diagnosticCredentials)
    .values({
      runId,
      provider,
      encryptedCredentials: encrypted,
      status: "validated",
      validatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: diagnosticCredentials.runId,
      set: {
        provider,
        encryptedCredentials: encrypted,
        status: "validated",
        validatedAt: now,
      },
    });
}

export async function loadCredentials(
  db: Db,
  env: Pick<Env, "MCP_ENCRYPTION_KEY">,
  runId: string,
): Promise<{ provider: DiagnosticProvider; credentials: DiagnosticCredentialMap } | null> {
  const rows = await db
    .select()
    .from(diagnosticCredentials)
    .where(eq(diagnosticCredentials.runId, runId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.provider !== "spectora" && row.provider !== "isn") return null;
  const credentials = await decryptJson<DiagnosticCredentialMap>(
    encryptionKey(env),
    row.encryptedCredentials,
  );
  return { provider: row.provider, credentials };
}

export async function deleteCredentials(db: Db, runId: string): Promise<void> {
  await db.delete(diagnosticCredentials).where(eq(diagnosticCredentials.runId, runId));
}

/**
 * Validate credentials with one cheap read. Errors are sanitized: no provider
 * payload or credential material is returned to the caller or logged.
 */
export async function validateCredentials(
  env: Env,
  provider: DiagnosticProvider,
  credentials: DiagnosticCredentialMap,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const adapter = createProviderAdapter(env, { provider, credentials });
    await adapter.searchClients({ limit: 1 });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const safe = message
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
      .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
      .slice(0, 200);
    return { ok: false, error: safe || "Could not connect to your platform" };
  }
}
