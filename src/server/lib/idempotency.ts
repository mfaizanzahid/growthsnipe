import { idempotencyKeys } from "../../../db/schema";
import { eq } from "drizzle-orm";
import type { Db } from "../repositories/db";
import { sha256Hex } from "./crypto";
import { nowMs } from "./time";

export class DuplicateIdempotencyError extends Error {
  constructor(key: string) {
    super(`Idempotency key already in progress: ${key}`);
    this.name = "DuplicateIdempotencyError";
  }
}

/** Narrow backend so payment services stay testable without a SQL driver. */
export interface IdempotencyBackend {
  get(key: string): Promise<{ status: string; responseJson: string | null } | null>;
  /** Insert a processing row; returns false when another request owns the key. */
  claim(key: string, operation: string, requestHash: string): Promise<boolean>;
  settle(key: string, status: "completed" | "failed", responseJson?: string): Promise<void>;
  /** Release a key so a failed operation can be retried. */
  release(key: string): Promise<void>;
}

export function dbIdempotency(db: Db): IdempotencyBackend {
  return {
    get: async (key) => {
      const rows = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, key))
        .limit(1);
      const row = rows[0];
      return row ? { status: row.status, responseJson: row.responseJson } : null;
    },
    claim: async (key, operation, requestHash) => {
      const now = nowMs();
      await db
        .insert(idempotencyKeys)
        .values({ key, operation, requestHash, status: "processing", createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: idempotencyKeys.key });
      const rows = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, key))
        .limit(1);
      return rows.length > 0 && rows[0]!.status === "processing";
    },
    settle: async (key, status, responseJson) => {
      await db
        .update(idempotencyKeys)
        .set({ status, responseJson: responseJson ?? null, updatedAt: nowMs() })
        .where(eq(idempotencyKeys.key, key));
    },
    release: async (key) => {
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    },
  };
}

/**
 * Guards a payment mutation with an idempotency key.
 *
 * - Completed keys return the cached response (double-submit safety).
 * - Processing keys (concurrent duplicates) throw DuplicateIdempotencyError.
 * - Failed keys are RELEASED and the operation re-runs, so legitimate
 *   retries (fixed card, completed tracker) proceed. Callers that must rate
 *   limit retries enforce their own cooldown (e.g. payInvoice's 5-min rule).
 *
 * The unique index on `idempotency_keys.key` is the last line of defense for
 * concurrent duplicate requests.
 */
export async function withIdem<T>(
  backend: IdempotencyBackend,
  key: string,
  requestHash: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<{ cached: boolean; result: T }> {
  const existing = await backend.get(key);
  if (existing) {
    if (existing.status === "completed" && existing.responseJson) {
      return { cached: true, result: JSON.parse(existing.responseJson) as T };
    }
    if (existing.status === "failed") {
      await backend.release(key);
    } else {
      throw new DuplicateIdempotencyError(key);
    }
  }

  const won = await backend.claim(key, operation, requestHash);
  if (!won) throw new DuplicateIdempotencyError(key);

  try {
    const result = await fn();
    await backend.settle(key, "completed", JSON.stringify(result));
    return { cached: false, result };
  } catch (err) {
    await backend.settle(key, "failed");
    throw err;
  }
}

/**
 * Guards a payment mutation with an idempotency key.
 *
 * - If the key was already completed, returns the cached response.
 * - If processing (or a race) is detected, throws DuplicateIdempotencyError.
 * - Otherwise runs `fn` and persists its JSON response atomically.
 *
 * The unique index on `idempotency_keys.key` is the last line of defense for
 * concurrent duplicate requests.
 */
export async function withIdempotency<T>(
  db: Db,
  key: string,
  requestHash: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<{ cached: boolean; result: T }> {
  return withIdem(dbIdempotency(db), key, requestHash, operation, fn);
}

export function requestHashFor(payload: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(JSON.stringify(payload)));
}
