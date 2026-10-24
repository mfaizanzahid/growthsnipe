import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "../repositories/db";
import type { Env } from "../lib/env";
import { decryptJson } from "../lib/crypto";
import { createProviderAdapter } from "../providers/registry";
import type { BusinessProviderAdapter, OrderRecord, ProviderKey } from "../providers/types";
import { splitPeople } from "../briefing/analyze";
import {
  orgAgents,
  orgDashboardLayouts,
  orgInspectorTargets,
  orgOrderServices,
  orgOrders,
  orgSyncState,
  sidekickConnections,
} from "../db/schema";

/** 90-day provider windows: small enough for Spectora paging and ISN payloads. */
export const SYNC_CHUNK_DAYS = 90;
/** Chunks per scheduled run: bounds Cron CPU and subrequests for all-history backfills. */
export const SYNC_MAX_CHUNKS_PER_RUN = 4;
/** Empty chunks in a row before a backfill is declared complete (live). */
const EMPTY_CHUNKS_TO_FINISH = 2;
/** Safety floor: never walk further back than this many chunks (~15 years). */
const MAX_BACKFILL_CHUNKS = 60;
/** One-go seed budget: a full backfill runs to completion in a single task. */
export const FULL_BACKFILL_CHUNKS = MAX_BACKFILL_CHUNKS;
/** Chunk fetch attempts before giving up on one window (transient vendor hiccups). */
const CHUNK_ATTEMPTS = 3;
/** D1 batch slice: one round trip per slice instead of per statement. */
const BATCH_SLICE = 200;
/**
 * Per-order detail enrichment per run (ISN services live only on
 * `/rest/order/{id}`, one GET each). Newest first so the current business
 * view fills before ancient history; the hourly cadence completes the tail.
 */
const DEFAULT_ENRICH_PER_RUN = 500;
const DEFAULT_ENRICH_CONCURRENCY = 8;
const MAX_ENRICH_CONCURRENCY = 16;

function enrichPerRun(env: Pick<Env, "ANALYTICS_ENRICH_PER_RUN"> | undefined): number {
  const n = Number.parseInt(env?.ANALYTICS_ENRICH_PER_RUN?.trim() ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_ENRICH_PER_RUN;
  return Math.floor(n);
}

function enrichConcurrency(env: Pick<Env, "ANALYTICS_ENRICH_CONCURRENCY"> | undefined): number {
  const n = Number.parseInt(env?.ANALYTICS_ENRICH_CONCURRENCY?.trim() ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_ENRICH_CONCURRENCY;
  return Math.min(Math.floor(n), MAX_ENRICH_CONCURRENCY);
}

export interface SyncRunSummary {
  orgId: string;
  provider: ProviderKey | null;
  status: string;
  chunksSynced: number;
  rowsUpserted: number;
  /** Per-order detail enrichments completed this run (ISN services). */
  enriched: number;
  /** Detail reads attempted but failed (vendor throttle, dead rows, …). */
  enrichFailed: number;
  cursorDate: string | null;
  finished: boolean;
  error?: string;
}

function chunkRange(anchorMs: number, backChunks: number): { from: string; to: string } {
  const day = 86400000;
  const to = new Date(anchorMs - backChunks * SYNC_CHUNK_DAYS * day);
  const from = new Date(to.getTime() - SYNC_CHUNK_DAYS * day);
  return { from: from.toISOString(), to: to.toISOString() };
}

function normEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t === "" ? null : t;
}

function normPhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return d.length >= 7 ? d : null;
}

/** First present string among vendor key spellings (camelCase and snake_case). */
function firstPresent(details: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = details[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return undefined;
}

/**
 * Referring-agent contact details from a canonical order's raw vendor attrs.
 *
 * Verified live, never guessed:
 * - Spectora: `buyingAgentEmail` / `buyingAgentPhone` (probe 2026-10-23).
 * - ISN `/json/orders`: `agent_email` / `agent_mobile` (probe 2026-10-23;
 *   the row also carries `agent_display`, `agency_display`, `agency_name`).
 * ISN `/rest` listings carry only reference UUIDs, so those rows keep nulls.
 */
export function extractAgentContact(details: Record<string, unknown>): { email: string | null; phone: string | null } {
  return {
    email: normEmail(firstPresent(details, ["buyingAgentEmail", "buying_agent_email", "agentEmail", "agentemail", "agent_email"])),
    phone: normPhone(firstPresent(details, ["buyingAgentPhone", "buying_agent_phone", "agentMobile", "agentmobile", "agentPhone", "agent_mobile"])),
  };
}

/** Split a Spectora serviceNames-style value into basket items. ISN has no verified service field yet. */
export function splitServices(serviceType: unknown): string[] {
  return toNameList(serviceType);
}

/** Vendor service fields arrive as a delimited string or an array; never throw.
 * Arrays may hold plain names or `{name}` objects (ISN `services`/`packages`
 * detail rows); soft-deleted rows (`show: "no"`) are skipped. */
function toNameList(value: unknown): string[] {
  const clean = (p: string) => p.replace(/\s+/g, " ").trim();
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === "string") out.push(v);
      else if (typeof v === "number") out.push(String(v));
      else if (v && typeof v === "object") {
        const obj = v as { show?: unknown; name?: unknown; title?: unknown };
        if (obj.show === "no") continue;
        const n = obj.name ?? obj.title;
        if (typeof n === "string") out.push(n);
      }
    }
    return out.map(clean).filter((p) => p !== "");
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[,;|]/)
    .map(clean)
    .filter((p) => p !== "");
}

/**
 * Basket items for one order from its raw vendor attrs plus the canonical
 * serviceType fallback. Sources, all live-probed:
 * - Spectora listing: `serviceNames` (base) + `serviceAddOnNames` (addon).
 * - ISN `/rest/order/{id}` detail: `services[]` (base) + `packages[]`
 *   (package). On old orders ISN returns both arrays EMPTY while `fees[]`
 *   still carries the names, so fees are the fallback when services are
 *   absent — but never merged alongside them, which would double-count and
 *   drag financing fees into clean mixes. ISN `/json` windows carry none of
 *   these, which is why those rows rely on the enrichment pass below.
 */
export function extractBasket(
  details: Record<string, unknown>,
  serviceType: unknown,
): Array<{ name: string; kind: string }> {
  const listed = toNameList(details.services);
  const base = [
    ...toNameList((details.serviceNames as unknown) ?? serviceType),
    ...(listed.length > 0 ? listed : toNameList(details.fees)),
  ];
  const seen = new Set<string>();
  const baseNames = base.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
  const addons = toNameList(details.serviceAddOnNames).filter((n) => !seen.has(n));
  for (const n of addons) seen.add(n);
  const packages = toNameList(details.packages).filter((n) => !seen.has(n));
  return [
    ...baseNames.map((name) => ({ name, kind: "base" })),
    ...addons.map((name) => ({ name, kind: "addon" })),
    ...packages.map((name) => ({ name, kind: "package" })),
  ];
}

async function loadOrgProvider(db: Db, orgId: string): Promise<{ provider: ProviderKey; credentials: Record<string, string> } | null> {
  const rows = await db
    .select()
    .from(sidekickConnections)
    .where(and(eq(sidekickConnections.organizationId, orgId)))
    .limit(5);
  const row = rows[0];
  if (!row) return null;
  if (row.provider !== "spectora" && row.provider !== "isn") return null;
  return { provider: row.provider as ProviderKey, credentials: { __encrypted: row.encryptedCredentials } };
}

export async function runAnalyticsSyncForOrg(env: Env, db: Db, orgId: string, opts: { maxChunks?: number; nowMs?: number; adapter?: BusinessProviderAdapter } = {}): Promise<SyncRunSummary> {
  const maxChunks = Math.max(1, Math.min(opts.maxChunks ?? SYNC_MAX_CHUNKS_PER_RUN, MAX_BACKFILL_CHUNKS));
  const nowMs = opts.nowMs ?? Date.now();
  const conn = await loadOrgProvider(db, orgId);
  if (!conn) return { orgId, provider: null, status: "idle", chunksSynced: 0, rowsUpserted: 0, enriched: 0, enrichFailed: 0, cursorDate: null, finished: false, error: "No provider connection" };
  if (!env.MCP_ENCRYPTION_KEY) return { orgId, provider: conn.provider, status: "error", chunksSynced: 0, rowsUpserted: 0, enriched: 0, enrichFailed: 0, cursorDate: null, finished: false, error: "Missing MCP_ENCRYPTION_KEY" };

  const stateRows = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
  let state = stateRows[0];
  if (!state) {
    await db.insert(orgSyncState).values({ organizationId: orgId, provider: conn.provider, status: "backfilling", updatedAt: Math.floor(nowMs / 1000) });
    const fresh = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
    state = fresh[0]!;
  }
  if (state.provider !== conn.provider) {
    await db.update(orgSyncState).set({ provider: conn.provider, status: "backfilling", cursorDate: null, totalFetched: 0, errorText: null, updatedAt: Math.floor(nowMs / 1000) }).where(eq(orgSyncState.organizationId, orgId));
    state = { ...state, provider: conn.provider, status: "backfilling", cursorDate: null as string | null, totalFetched: 0 };
  }

  // How many 90-day chunks are already synced? Derive from cursorDate when present.
  let syncedChunks = 0;
  if (state.cursorDate) {
    const cursorMs = new Date(state.cursorDate).getTime();
    if (Number.isFinite(cursorMs)) syncedChunks = Math.max(0, Math.round((nowMs - cursorMs) / (SYNC_CHUNK_DAYS * 86400000)));
  }

  const creds = await decryptJson<Record<string, string>>(env.MCP_ENCRYPTION_KEY, conn.credentials.__encrypted);
  const adapter = opts.adapter ?? createProviderAdapter(env, { provider: conn.provider, credentials: creds });

  // Seed anchor for ETA math: set on fresh seeds, provider switches, and
  // pre-existing rows that predate these columns. The vendor total is fetched
  // at most once per seed (null persists as "unknown" for indeterminate UI).
  // Elapsed restarts when re-anchored mid-backfill; rates are approximate by
  // nature and documented as such client-side.
  let seedStartedAt = state.seedStartedAt ?? null;
  let totalEstimate = state.totalEstimate ?? null;
  if (seedStartedAt === null || totalEstimate === null) {
    seedStartedAt = Math.floor(nowMs / 1000);
    try {
      const estimate = await adapter.estimateTotal?.();
      totalEstimate =
        typeof estimate === "number" && Number.isFinite(estimate) && estimate > 0 ? Math.floor(estimate) : null;
    } catch {
      totalEstimate = null;
    }
  }

  let chunksSynced = 0;
  let rowsUpserted = 0;
  let emptyStreak = 0;
  let cursorDate = state.cursorDate;
  let finished = false;
  let error: string | undefined;
  let terminal = false;
  let budget = maxChunks;
  let headOk = false;
  // ISN rows whose listing carried no service info, for the detail pass below.
  const missing: Array<{ providerOrderId: string; scheduledAt: string | null }> = [];

  const nowSec = Math.floor(nowMs / 1000);

  /**
   * Persist progress mid-run, not just at the end: a killed run (deploy,
   * restart, timeout) otherwise leaves zeros behind while thousands of rows
   * sit committed, and the dashboard reports "0 orders synced". Checkpoints
   * preserve the run-start status; only the final write computes the outcome.
   */
  const checkpoint = async (cursor: string | null, fetched: number): Promise<void> => {
    await db
      .insert(orgSyncState)
      .values({ organizationId: orgId, provider: conn.provider, status: state.status, cursorDate: cursor, lastSyncedAt: nowSec, totalFetched: fetched, errorText: null, updatedAt: nowSec, seedStartedAt, totalEstimate })
      .onConflictDoUpdate({ target: orgSyncState.organizationId, set: { provider: conn.provider, status: state.status, cursorDate: cursor, lastSyncedAt: nowSec, totalFetched: fetched, errorText: null, updatedAt: nowSec, seedStartedAt, totalEstimate } });
  };

  // Head first: the latest window syncs on EVERY run (incremental head).
  // Previously only the cursor advanced, so a live workspace re-read ancient
  // windows hourly and never picked up new orders. The head also heals rows
  // whose mapping improved since they were first stored. It never moves the
  // cursor and never counts toward the empty-window finish.
  if (budget > 0) {
    const headTo = new Date(nowMs).toISOString();
    const headFrom = new Date(nowMs - SYNC_CHUNK_DAYS * 86400000).toISOString();
    try {
      const headOrders = await fetchChunkWithRetry(adapter, conn.provider, headFrom, headTo);
      if (headOrders.length > 0) {
        await upsertOrders(db, orgId, conn.provider, headOrders, nowSec, missing);
        rowsUpserted += headOrders.length;
      }
      chunksSynced += 1;
      budget -= 1;
      headOk = true;
      await checkpoint(cursorDate, (state.totalFetched ?? 0) + rowsUpserted);
    } catch (err) {
      // Fall through: the backfill below re-covers fresh orgs, and the next
      // run retries live ones. Only auth failures are terminal (see below).
      if (httpStatusOf(err) === 401 || httpStatusOf(err) === 403) {
        error = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
        terminal = true;
      }
    }
  }

  let backDone = 0;
  for (let i = 0; i < budget && !terminal; i += 1) {
    // Skip the window the head just covered on fresh workspaces (unless the
    // head failed, in which case the backfill re-covers it).
    const backIndex = syncedChunks + backDone + (headOk && syncedChunks === 0 ? 1 : 0);
    if (backIndex >= MAX_BACKFILL_CHUNKS) { finished = true; break; }
    const { from, to } = chunkRange(nowMs, backIndex);
    try {
      const orders = await fetchChunkWithRetry(adapter, conn.provider, from, to);
      if (orders.length === 0) {
        emptyStreak += 1;
        chunksSynced += 1;
        backDone += 1;
        cursorDate = from;
        if (emptyStreak >= EMPTY_CHUNKS_TO_FINISH) { finished = true; break; }
        await checkpoint(cursorDate, (state.totalFetched ?? 0) + rowsUpserted);
        continue;
      }
      emptyStreak = 0;
      await upsertOrders(db, orgId, conn.provider, orders, nowSec, missing);
      rowsUpserted += orders.length;
      chunksSynced += 1;
      backDone += 1;
      cursorDate = from;
      await checkpoint(cursorDate, (state.totalFetched ?? 0) + rowsUpserted);
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
      // Auth failures mean the stored credentials are wrong: surface them as
      // terminal so the owner checks the connection instead of retrying hourly
      // forever. Everything else stays resumable (see status below).
      terminal = httpStatusOf(err) === 401 || httpStatusOf(err) === 403;
      break;
    }
  }

  const totalFetched = (state.totalFetched ?? 0) + rowsUpserted;
  // A failed chunk never advances the cursor, so the next run retries the
  // same window. Transient vendor hiccups (including ISN's occasional
  // non-JSON HTTP 200) therefore resume as backfilling instead of parking
  // the whole seed in a terminal error on one bad window.
  // Head-only runs (hourly incrementals on live workspaces) must not flip a
  // live workspace back to backfilling: when the cursor didn't move and the
  // seed had already finished, it stays live.
  const cursorMoved = (cursorDate ?? null) !== (state.cursorDate ?? null);
  const status =
    error
      ? terminal ? "error" : "backfilling"
      : finished || (state.status === "live" && !cursorMoved)
        ? "live"
        : "backfilling";
  // Enrichment must never sink the run: its failure is recorded for the next
  // retry, but the final state write below still happens — otherwise the
  // cursor, totals, and even the live flip are lost with it (exactly how one
  // D1 bound-parameter rejection parked whole seeds in limbo).
  let enriched = 0;
  let enrichFailed = 0;
  if (!terminal) {
    try {
      const result = await enrichMissingServices(adapter, db, orgId, conn.provider, missing, enrichPerRun(env), enrichConcurrency(env));
      enriched = result.done;
      enrichFailed = result.failed;
      // Total blackout (attempts made, nothing landed) is recorded, not
      // swallowed: per-order failures are otherwise invisible, and a 0 with
      // no error is indistinguishable from "nothing to do". Partial progress
      // stays quiet. Non-terminal: the next run retries.
      if (result.attempted > 0 && result.done === 0 && result.failed > 0) {
        error ??= `service detail unavailable for ${result.attempted} orders (${result.firstError ?? "unknown error"})`;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
      error ??= detail;
    }
  }
  await db
    .insert(orgSyncState)
    .values({ organizationId: orgId, provider: conn.provider, status, cursorDate, lastSyncedAt: Math.floor(nowMs / 1000), totalFetched, errorText: error ?? null, updatedAt: Math.floor(nowMs / 1000), seedStartedAt, totalEstimate })
    .onConflictDoUpdate({ target: orgSyncState.organizationId, set: { provider: conn.provider, status, cursorDate, lastSyncedAt: Math.floor(nowMs / 1000), totalFetched, errorText: error ?? null, updatedAt: Math.floor(nowMs / 1000), seedStartedAt, totalEstimate } });

  return { orgId, provider: conn.provider, status, chunksSynced, rowsUpserted, enriched, enrichFailed, cursorDate, finished, error };
}

/** Seed a workspace in one continuous run (connect-time): walks the whole
 * history instead of spreading chunks across hourly ticks. The hourly cron
 * resumes automatically if this run is cut short, so callers treat a
 * non-live status as "still going", never as failure. */
export async function runFullBackfill(env: Env, db: Db, orgId: string, nowMs: number = Date.now()): Promise<SyncRunSummary> {
  return runAnalyticsSyncForOrg(env, db, orgId, { maxChunks: FULL_BACKFILL_CHUNKS, nowMs });
}

/** Provider HTTP status when the error carries one (both adapters set httpStatus). */
function httpStatusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "httpStatus" in err) {
    const s = (err as { httpStatus?: unknown }).httpStatus;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

/** One chunk with retries: ISN intermittently answers HTTP 200 with a
 * non-JSON body, and a single bad window must not kill a whole backfill. */async function fetchChunkWithRetry(
  adapter: { searchOrders: (input: { limit: number; from: string; to: string; status?: string; cursor?: string }) => Promise<{ items: OrderRecord[]; nextCursor?: string }> },
  provider: ProviderKey,
  from: string,
  to: string,
): Promise<OrderRecord[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt += 1) {
    try {
      return await fetchChunkOrders(adapter, provider, from, to);
    } catch (err) {
      lastErr = err;
      // No point retrying rejected credentials inside one run.
      if (httpStatusOf(err) === 401 || httpStatusOf(err) === 403) throw err;
      if (attempt < CHUNK_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

/**
 * Execute statements in slices: a single D1 round trip per slice instead of
 * per statement (a busy chunk is thousands of writes). The sqlite-proxy
 * driver used in tests exposes a `batch` stub that throws, so the first
 * failure permanently falls back to sequential execution for the process.
 */
let batchSupported: boolean | undefined;
async function runBatch(db: Db, stmts: unknown[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += BATCH_SLICE) {
    const slice = stmts.slice(i, i + BATCH_SLICE);
    if (batchSupported !== false) {
      try {
        const batch = (db as unknown as { batch?: (s: unknown[]) => Promise<unknown> }).batch;
        if (typeof batch === "function") {
          await batch.call(db, slice);
          batchSupported = true;
          continue;
        }
      } catch {
        batchSupported = false;
      }
    }
    for (const s of slice) await (s as Promise<unknown>);
  }
}

/**
 * Fill service detail for ISN rows whose window listing carried none, via
 * per-order `/rest/order/{id}` reads (the only endpoint that returns
 * `services[]`/`packages[]`; there is no bulk form). Newest first so the
 * current business view fills before ancient history, capped per run, one
 * bad order never blocking the rest. Rows already served are skipped.
 *
 * Candidates come from two places: this run's fresh upserts (new/changed
 * rows, including the hourly head) plus the oldest still-bare rows in the
 * warehouse. The tail matters: live workspaces only ever re-touch the head,
 * so without it ancient rows would stay bare forever and coverage would
 * freeze the moment a seed flips live.
 */
async function enrichMissingServices(
  adapter: BusinessProviderAdapter,
  db: Db,
  orgId: string,
  provider: ProviderKey,
  headMissing: Array<{ providerOrderId: string; scheduledAt: string | null }>,
  perRun: number,
  concurrency: number,
): Promise<{ done: number; failed: number; attempted: number; firstError: string | null }> {
  const empty = { done: 0, failed: 0, attempted: 0, firstError: null as string | null };
  if (perRun < 1) return empty;
  let tail: Array<{ providerOrderId: string; scheduledAt: string | null }> = [];
  if (provider === "isn") {
    const rows = await db
      .select({ providerOrderId: orgOrders.providerOrderId, scheduledAt: orgOrders.scheduledAt })
      .from(orgOrders)
      .leftJoin(
        orgOrderServices,
        and(eq(orgOrderServices.orderId, orgOrders.id), eq(orgOrderServices.organizationId, orgId)),
      )
      .where(
        and(
          eq(orgOrders.organizationId, orgId),
          eq(orgOrders.provider, "isn"),
          ne(orgOrders.status, "cancelled"),
          isNull(orgOrderServices.orderId),
        ),
      )
      .orderBy(asc(orgOrders.scheduledAt))
      .limit(perRun);
    tail = rows.map((r) => ({ providerOrderId: r.providerOrderId, scheduledAt: r.scheduledAt }));
  }
  const merged = [...headMissing, ...tail];
  if (merged.length === 0) return empty;
  const sorted = [...merged].sort((a, b) => (a.scheduledAt ?? "") < (b.scheduledAt ?? "") ? 1 : -1);
  const ids = [...new Set(sorted.map((m) => `${orgId}:isn:${m.providerOrderId}`))];
  // D1 allows at most 100 bound parameters per statement: slice the
  // existence check (a busy head window alone carries hundreds of ids).
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) {
    const slice = ids.slice(i, i + 90);
    const found = await db
      .select({ orderId: orgOrderServices.orderId })
      .from(orgOrderServices)
      .where(and(eq(orgOrderServices.organizationId, orgId), inArray(orgOrderServices.orderId, slice)));
    for (const r of found) have.add(r.orderId);
  }
  const seen = new Set<string>();
  const todo = sorted
    .filter((m) => {
      const id = `${orgId}:isn:${m.providerOrderId}`;
      if (have.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, perRun);
  const stmts: unknown[] = [];
  let done = 0;
  let failed = 0;
  let firstError: string | null = null;
  // Bounded worker pool: detail reads are network-bound, so a handful in
  // flight at once fills far faster than sequential fetches. Each order is
  // independent (deterministic statement ids), so completion order is moot.
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), todo.length) }, async () => {
    while (next < todo.length) {
      const m = todo[next++]!;
      try {
        const detail = await adapter.getOrder(m.providerOrderId);
        const items = extractBasket((detail?.details ?? {}) as Record<string, unknown>, undefined);
        if (items.length === 0) continue;
        const orderId = `${orgId}:isn:${m.providerOrderId}`;
        stmts.push(db.delete(orgOrderServices).where(and(eq(orgOrderServices.organizationId, orgId), eq(orgOrderServices.orderId, orderId))));
        items.forEach((item, idx) => {
          stmts.push(
            db.insert(orgOrderServices).values({ id: `${orderId}:svc:${idx}`, organizationId: orgId, orderId, name: item.name, kind: item.kind, amountMinor: null }).onConflictDoNothing(),
          );
        });
        done += 1;
      } catch (err) {
        // One unreadable order never blocks the rest; failures are counted
        // (noticed below) and retried next run.
        failed += 1;
        if (firstError === null) {
          firstError = err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
        }
      }
    }
  });
  await Promise.all(workers);
  await runBatch(db, stmts);
  return { done, failed, attempted: todo.length, firstError };
}

/** One chunk from the provider. Spectora merges the disjoint cancelled listing. */
async function fetchChunkOrders(adapter: { searchOrders: (input: { limit: number; from: string; to: string; status?: string; cursor?: string }) => Promise<{ items: OrderRecord[]; nextCursor?: string }> }, provider: ProviderKey, from: string, to: string): Promise<OrderRecord[]> {
  if (provider === "spectora") {
    const items: OrderRecord[] = [];
    const seen = new Set<string>();
    // Default listing pages (cancelled excluded upstream).
    let cursor: string | undefined;
    for (let page = 0; page < 25; page += 1) {
      const res = await adapter.searchOrders({ limit: 200, from, to, cursor });
      for (const o of res.items) {
        if (!seen.has(o.id)) { seen.add(o.id); items.push(o); }
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    // Disjoint cancelled population for the same window.
    try {
      let cancelCursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const res = await adapter.searchOrders({ limit: 200, from, to, status: "cancelled", cursor: cancelCursor });
        for (const o of res.items) {
          if (!seen.has(o.id)) { seen.add(o.id); items.push({ ...o, status: "cancelled" }); }
        }
        if (!res.nextCursor) break;
        cancelCursor = res.nextCursor;
      }
    } catch {
      // Cancel pass is additive; a failure degrades to listing-only for this chunk.
    }
    return items;
  }
  // ISN: one windowed /json/orders call returns the whole chunk.
  const res = await adapter.searchOrders({ limit: 50000, from, to });
  return res.items;
}

async function upsertOrders(
  db: Db,
  orgId: string,
  provider: ProviderKey,
  orders: OrderRecord[],
  nowSec: number,
  missing?: Array<{ providerOrderId: string; scheduledAt: string | null }>,
): Promise<void> {
  const agentAgg = new Map<string, { name: string | null; email: string | null; phone: string | null; first: string | null; last: string | null; count: number }>();
  // Collect first, write in batches: per-statement round trips make busy
  // chunks (thousands of writes) take minutes on D1. Order is preserved, so
  // each order's service delete still precedes its inserts.
  const stmts: unknown[] = [];
  for (const o of orders) {
    const inspectors = splitPeople(o.inspectorName);
    const scheduledAt = typeof o.scheduledAt === "string" ? o.scheduledAt : null;
    const id = `${orgId}:${provider}:${o.id}`;
    const details = (o.details ?? {}) as Record<string, unknown>;
    const { email: agentEmail, phone: agentPhone } = extractAgentContact(details);
    stmts.push(
      db
        .insert(orgOrders)
        .values({
          id,
          organizationId: orgId,
          provider,
          providerOrderId: String(o.id),
          status: typeof o.status === "string" ? o.status.toLowerCase() : "scheduled",
          scheduledAt,
          completedAt: typeof o.completedAt === "string" ? o.completedAt : null,
          totalMinor: typeof o.total === "number" ? o.total : null,
          currency: typeof o.currency === "string" ? o.currency : "USD",
          inspectorNames: JSON.stringify(inspectors),
          buyerName: typeof o.buyerName === "string" ? o.buyerName : null,
          buyingAgentName: typeof o.buyingAgentName === "string" ? o.buyingAgentName : null,
          buyingAgentEmail: agentEmail,
          buyingAgentPhone: agentPhone,
          sellingAgentName: typeof o.sellingAgentName === "string" ? o.sellingAgentName : null,
          serviceType: typeof o.serviceType === "string" ? o.serviceType : null,
          referralSource: typeof o.referralSource === "string" ? o.referralSource : null,
          address: typeof o.address === "string" ? o.address : null,
          providerUpdatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
          syncedAt: nowSec,
          rawJson: o.details ? JSON.stringify(o.details).slice(0, 20000) : null,
        })
        .onConflictDoUpdate({
          target: [orgOrders.organizationId, orgOrders.provider, orgOrders.providerOrderId],
          set: {
            status: typeof o.status === "string" ? o.status.toLowerCase() : "scheduled",
            scheduledAt,
            completedAt: typeof o.completedAt === "string" ? o.completedAt : null,
            totalMinor: typeof o.total === "number" ? o.total : null,
            inspectorNames: JSON.stringify(inspectors),
            serviceType: typeof o.serviceType === "string" ? o.serviceType : null,
            buyingAgentEmail: agentEmail,
            buyingAgentPhone: agentPhone,
            syncedAt: nowSec,
          },
        }),
    );

    // Basket items: replace per order so re-syncs never duplicate. Rows with
    // no service info leave existing rows alone: ISN `/json` windows carry
    // no services, and wiping here would delete what the enrichment pass
    // below already captured from per-order detail reads.
    const basket = extractBasket(details, o.serviceType);
    if (basket.length > 0) {
      stmts.push(db.delete(orgOrderServices).where(and(eq(orgOrderServices.organizationId, orgId), eq(orgOrderServices.orderId, id))));
      basket.forEach((item, svcIdx) => {
        // Do-nothing on conflict: concurrent runs (tab driver plus cron) may
        // interleave the same deterministic ids; the content is identical.
        stmts.push(
          db.insert(orgOrderServices).values({ id: `${id}:svc:${svcIdx}`, organizationId: orgId, orderId: id, name: item.name, kind: item.kind, amountMinor: null }).onConflictDoNothing(),
        );
      });
    } else if (provider === "isn") {
      missing?.push({ providerOrderId: String(o.id), scheduledAt });
    }

    // Referring-agent identity: email first, phone fallback (owner decision).
    const email = agentEmail;
    const phone = agentPhone;
    const key = email ? `e:${email}` : phone ? `p:${phone}` : null;
    if (key && o.buyingAgentName) {
      const cur = agentAgg.get(key) ?? { name: null, email: null, phone: null, first: null, last: null, count: 0 };
      cur.name = o.buyingAgentName;
      cur.email = email;
      cur.phone = phone;
      cur.count += 1;
      if (scheduledAt && (!cur.first || scheduledAt < cur.first)) cur.first = scheduledAt;
      if (scheduledAt && (!cur.last || scheduledAt > cur.last)) cur.last = scheduledAt;
      agentAgg.set(key, cur);
    }
  }
  for (const [key, a] of agentAgg) {
    const id = `${orgId}:agent:${key}`;
    stmts.push(
      db
        .insert(orgAgents)
        .values({ id, organizationId: orgId, name: a.name, email: a.email, phone: a.phone, firstSeenAt: a.first, lastSeenAt: a.last, orderCount: a.count })
        .onConflictDoNothing(),
    );
  }
  await runBatch(db, stmts);
  void orgDashboardLayouts;
  void orgInspectorTargets;
}
