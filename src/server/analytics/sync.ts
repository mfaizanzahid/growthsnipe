import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../repositories/db";
import { deleteSetting, getSetting, setSetting } from "../repositories";
import type { Env } from "../lib/env";
import { decryptJson } from "../lib/crypto";
import { createProviderAdapter } from "../providers/registry";
import type { BusinessProviderAdapter, OrderRecord, ProviderKey } from "../providers/types";
import { splitPeople } from "../briefing/analyze";
import { toMinorUnits } from "../providers/money";
import {
  orgDashboardLayouts,
  orgInspectorTargets,
  orgOrderInspectors,
  orgOrderServices,
  orgOrders,
  orgSyncState,
  sidekickConnections,
} from "../db/schema";

/** 90-day provider windows: small enough for Spectora paging and ISN payloads. */
export const SYNC_CHUNK_DAYS = 90;
/** Warehouse history depth: the last 5 years, plus the full starting year.
 * The walk extends back to January 1st of the cutoff year so the earliest
 * year always syncs January to December and can serve as the growth base. */
export const SYNC_HISTORY_YEARS = 5;
/** Chunks per scheduled run: bounds Cron CPU and subrequests for 5-year backfills. */
export const SYNC_MAX_CHUNKS_PER_RUN = 4;
/** Empty chunks in a row before a backfill is declared complete (live). */
const EMPTY_CHUNKS_TO_FINISH = 2;
/** Safety floor: 90-day chunks covering the 5-year history, the full
 * starting year, plus headroom. The Jan-1 bound below stops the walk
 * regardless; this only caps budgets and runaway loops. */
const MAX_BACKFILL_CHUNKS = Math.ceil(((SYNC_HISTORY_YEARS + 1) * 366) / SYNC_CHUNK_DAYS);

/**
 * Whether any of the org's orders still lack service rows. Answered from
 * the O(1) coverage counters on the state row (migration 0040), never a
 * table scan: the per-minute tick and supervisor call this constantly, and
 * the LEFT JOIN + IS NULL probe it replaced scanned ~95k rows per call past
 * ~30k orders (97% of prod D1 read burn, then the daily budget itself).
 * Cancelled orders never count: orders_total only tracks non-cancelled rows
 * (see upsertOrders deltas), so a fully drained org reads covered == total.
 */
export async function hasEnrichmentBacklog(db: Db, orgId: string): Promise<boolean> {
  const rows = await db
    .select({ total: orgSyncState.ordersTotal, covered: orgSyncState.ordersWithServices })
    .from(orgSyncState)
    .where(eq(orgSyncState.organizationId, orgId))
    .limit(1);
  const s = rows[0];
  // No state row yet means nothing seeded: same answer as the old probe on
  // an empty warehouse (no rows, no bare rows).
  if (!s) return false;
  return (s.covered ?? 0) < (s.total ?? 0);
}

/**
 * Run lease so overlapping ticks never redo the same work. A tick claims
 * the lease (start timestamp in app settings) before running an org,
 * releases it when the run finishes, and skips orgs with a fresh lease:
 * per-minute ticks outpace minute-plus enrichment runs, and without this
 * every other tick would redo the same detail reads. Stale leases (crashed
 * runs) expire by time; an unreadable lease store runs anyway rather than
 * stalling the seed. The check-then-set races in theory, but the window is
 * milliseconds against a minute cadence.
 */
export const SYNC_RUN_LEASE_MS = 120_000;

export function syncRunLeaseKey(orgId: string): string {
  return `sync_run_lease:${orgId}`;
}

export async function claimRunLease(db: Db, orgId: string, nowMs: number): Promise<boolean> {
  try {
    const raw = await getSetting(db, syncRunLeaseKey(orgId));
    const started = Number.parseInt(raw ?? "", 10);
    if (Number.isFinite(started) && nowMs - started < SYNC_RUN_LEASE_MS) return false;
    await setSetting(db, syncRunLeaseKey(orgId), String(nowMs));
    return true;
  } catch {
    return true;
  }
}

/** Release a claimed lease, but only if it still carries our start
 * timestamp: a denied tick must never delete another tick's lease, and a
 * finished holder must not clear a successor's fresh claim. Best-effort: a
 * missed release just leaves the 120s expiry to clean up. */
export async function releaseRunLease(db: Db, orgId: string, startedMs: number): Promise<void> {
  try {
    const raw = await getSetting(db, syncRunLeaseKey(orgId));
    if (raw === String(startedMs)) {
      await deleteSetting(db, syncRunLeaseKey(orgId));
    }
  } catch {
    // Expiry covers it.
  }
}

/**
 * Cap-aware backfill progress for the status endpoint. The vendor grand
 * total covers all-time history while we only pull 5 years, so rows-over-
 * estimate can never reach 100%; chunk position over the fixed walk can.
 * A live seed reports complete; an unknown cursor reports zero.
 */
export function backfillProgress(cursorDate: string | null, status: string, nowMs: number): { done: number; total: number } {
  const total = MAX_BACKFILL_CHUNKS;
  if (status === "live") return { done: total, total };
  if (!cursorDate) return { done: 0, total };
  const cursorMs = new Date(cursorDate).getTime();
  if (!Number.isFinite(cursorMs)) return { done: 0, total };
  return { done: Math.max(0, Math.min(total, Math.round((nowMs - cursorMs) / (SYNC_CHUNK_DAYS * 86400000)))), total };
}
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
const DEFAULT_ENRICH_PER_RUN = 1000;
const DEFAULT_ENRICH_CONCURRENCY = 24;
const MAX_ENRICH_CONCURRENCY = 32;

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

/**
 * Materialized referring-agent identity: email first, phone fallback.
 * Must match metrics.ts agentKey exactly (e:<lower email> else p:<digits>).
 * NULL when neither contact is present; keyless rows are excluded from the
 * leaderboard in both SQL and JS paths.
 */
export function toAgentKey(email: string | null, phone: string | null): string | null {
  if (email) return `e:${email}`;
  if (phone) return `p:${phone}`;
  return null;
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
 *
 * Amounts ride only on ISN `fees[]` rows (`fees[].amount`, major units per
 * the `total_fee` convention and live-probed magnitudes — a $389 inspection
 * reads 389, a $10 financing fee reads 10; the ISN spec itself punts on
 * units, see the decision log). Everything else carries null (unknown,
 * always kept). Non-numeric and negative amounts also map to null (never
 * guessed, never dropped): only an explicit numeric zero is zero.
 */
export interface BasketItem {
  name: string;
  kind: string;
  amountMinor: number | null;
}

function cleanName(p: string): string {
  return p.replace(/\s+/g, " ").trim();
}

function feeLines(value: unknown): Array<{ name: string; amountMinor: number | null }> {
  // Delimited-string fees predate the object shape; names only, no amounts.
  if (typeof value === "string") {
    return toNameList(value).map((name) => ({ name, amountMinor: null as number | null }));
  }
  if (!Array.isArray(value)) return [];
  const out: Array<{ name: string; amountMinor: number | null }> = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const obj = v as { show?: unknown; name?: unknown; title?: unknown; amount?: unknown };
    if (obj.show === "no") continue;
    const raw = obj.name ?? obj.title;
    if (typeof raw !== "string") continue;
    const name = cleanName(raw);
    if (name === "") continue;
    const amountMinor =
      typeof obj.amount === "number" || typeof obj.amount === "string"
        ? (toMinorUnits(obj.amount) ?? null)
        : null;
    out.push({ name, amountMinor });
  }
  return out;
}

/**
 * Fee amount lookup: an exact cleaned-name match attaches the amount only
 * when unambiguous (exactly one numeric amount for the name). Unknown,
 * non-numeric, negative, or multiply-defined amounts resolve to null
 * (kept, never guessed) — a mismatched amount is worse than none, and
 * only an explicit numeric zero may later filter a row.
 */
function feeAmountLookup(lines: Array<{ name: string; amountMinor: number | null }>): Map<string, number | null> {
  const byName = new Map<string, Array<number | null>>();
  for (const line of lines) {
    const list = byName.get(line.name) ?? [];
    list.push(line.amountMinor);
    byName.set(line.name, list);
  }
  const out = new Map<string, number | null>();
  for (const [name, amounts] of byName) {
    const numeric = amounts.filter((a): a is number => typeof a === "number");
    out.set(name, numeric.length === 1 ? numeric[0]! : null);
  }
  return out;
}

export function extractBasket(
  details: Record<string, unknown>,
  serviceType: unknown,
): BasketItem[] {
  const listed = toNameList(details.services);
  const fees = feeLines(details.fees);
  const lookup = feeAmountLookup(fees);
  const withAmount = (name: string): number | null => lookup.get(name) ?? null;
  const feeFallback =
    listed.length > 0
      ? []
      : fees.map(({ name, amountMinor }) => ({ name, kind: "base", amountMinor }));
  const base = [
    ...toNameList((details.serviceNames as unknown) ?? serviceType).map((name) => ({ name, kind: "base", amountMinor: withAmount(name) })),
    ...(listed.length > 0
      ? listed.map((name) => ({ name, kind: "base", amountMinor: withAmount(name) }))
      : feeFallback),
  ];
  const seen = new Set<string>();
  const baseNames = base.filter((n) => (seen.has(n.name) ? false : (seen.add(n.name), true)));
  const addons = toNameList(details.serviceAddOnNames)
    .filter((n) => !seen.has(n))
    .map((name) => ({ name, kind: "addon", amountMinor: withAmount(name) }));
  for (const n of addons) seen.add(n.name);
  const packages = toNameList(details.packages)
    .filter((n) => !seen.has(n))
    .map((name) => ({ name, kind: "package", amountMinor: withAmount(name) }));
  return [...baseNames, ...addons, ...packages];
}

/** Marker row for orders whose detail read succeeded but yielded nothing
 * chargeable: counts as enrichment-complete (never re-claimed) while never
 * reading as a purchased service. Failed reads never mark (they retry). */
export const NO_CHARGE_MARKER = "__no_charge__";

/**
 * Fee-name noise for basket analytics: surcharges, financing lines, refunds
 * and discounts are real charges but not performed services — as basket rows
 * they would rank payment processing as a best-selling service. Matched
 * case-insensitively (SQLite LIKE is ASCII case-insensitive; keep the JS
 * predicate in sync).
 */
export const FEE_NOISE_PATTERNS = ["%fee%", "%refund%", "%discount%"] as const;

export function isFeeNoise(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("fee") || lower.includes("refund") || lower.includes("discount");
}

/**
 * Fee-derived basket items for one order's detail payload: ISN `fees[]`
 * rows with amounts, minus noise names. This is the basket-mix source of
 * truth (services[]/packages/addons names are deliberately NOT rows here —
 * they carry no amounts and would double-count the same work). Unknown and
 * negative amounts are kept as null; explicit zeros are kept here and
 * filtered at write time (an all-zero order resolves to the marker row).
 */
export function extractFeeItems(details: Record<string, unknown>): BasketItem[] {
  const out: BasketItem[] = [];
  for (const line of feeLines(details.fees)) {
    if (isFeeNoise(line.name)) continue;
    // No dedupe: two identical charges (two trips at $99) are two real
    // charges. Jobs count distinct orders, so repeats add revenue signal,
    // never inflated job counts.
    out.push({ name: line.name, kind: "fee", amountMinor: line.amountMinor });
  }
  return out;
}

/**
 * Service-name fallback for details with no usable fee lines: services[],
 * serviceNames, addons and packages with null amounts (no fee data to match
 * against in this branch by construction). Keeps fee-less details visible
 * instead of marking everything unknown.
 */
function serviceNameItems(details: Record<string, unknown>, serviceType: unknown): BasketItem[] {
  const listed = toNameList(details.services);
  const base = [
    ...toNameList((details.serviceNames as unknown) ?? serviceType).map((name) => ({ name, kind: "base", amountMinor: null as number | null })),
    ...listed.map((name) => ({ name, kind: "base", amountMinor: null as number | null })),
  ];
  const seen = new Set<string>();
  const baseNames = base.filter((n) => (seen.has(n.name) ? false : (seen.add(n.name), true)));
  const addons = toNameList(details.serviceAddOnNames)
    .filter((n) => !seen.has(n))
    .map((name) => ({ name, kind: "addon", amountMinor: null as number | null }));
  for (const n of addons) seen.add(n.name);
  const packages = toNameList(details.packages)
    .filter((n) => !seen.has(n))
    .map((name) => ({ name, kind: "package", amountMinor: null as number | null }));
  return [...baseNames, ...addons, ...packages];
}

/**
 * Enrichment items for one order's detail payload: fee lines when usable,
 * service names otherwise. Failed reads never reach here (they throw and
 * retry); empty results resolve to the marker row at write time.
 */
export function extractEnrichItems(details: Record<string, unknown>): BasketItem[] {
  const fees = extractFeeItems(details);
  if (fees.length > 0) return fees;
  return serviceNameItems(details, undefined);
}

export async function loadOrgProvider(db: Db, orgId: string): Promise<{ provider: ProviderKey; credentials: Record<string, string> } | null> {
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

export async function runAnalyticsSyncForOrg(env: Env, db: Db, orgId: string, opts: { maxChunks?: number; nowMs?: number; adapter?: BusinessProviderAdapter; head?: boolean; enrich?: boolean } = {}): Promise<SyncRunSummary> {
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
    await db.update(orgSyncState).set({ provider: conn.provider, status: "backfilling", cursorDate: null, totalFetched: 0, ordersTotal: 0, ordersWithServices: 0, errorText: null, updatedAt: Math.floor(nowMs / 1000) }).where(eq(orgSyncState.organizationId, orgId));
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
   * Positions merge monotonically (see mergeSyncCursor) so concurrent runs
   * can never regress the walk.
   */
  const checkpoint = async (cursor: string | null, fetched: number): Promise<void> => {
    const current = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
    const cur = current[0];
    const nextCursor = mergeSyncCursor(cur?.cursorDate ?? null, cursor);
    const nextFetched = mergeSyncFetched(cur?.totalFetched, fetched);
    // ordersTotal is deliberately NOT written here: it is delta-maintained
    // by upsertOrders (new rows / status transitions), so a checkpoint must
    // preserve it, not mirror total_fetched (which includes cancelled rows
    // the backlog boolean must never count).
    await db
      .insert(orgSyncState)
      .values({ organizationId: orgId, provider: conn.provider, status: state.status, cursorDate: nextCursor, lastSyncedAt: nowSec, totalFetched: nextFetched, errorText: null, updatedAt: nowSec, seedStartedAt, totalEstimate })
      .onConflictDoUpdate({ target: orgSyncState.organizationId, set: { provider: conn.provider, status: state.status, cursorDate: nextCursor, lastSyncedAt: nowSec, totalFetched: nextFetched, errorText: null, updatedAt: nowSec, seedStartedAt, totalEstimate } });
  };

  // Head first: the latest window syncs on EVERY run (incremental head),
  // unless the caller is a backfill link (which spends its whole budget on
  // history windows). Previously only the cursor advanced, so a live
  // workspace re-read ancient windows hourly and never picked up new orders.
  // It never moves the cursor and never counts toward the empty-window finish.
  //
  // Window enforcement: ISN ignores date bounds and returns out-of-window
  // rows, so the head response is filtered client-side to its window (rows
  // without a date are kept). Without this every run re-upserts thousands
  // of ancient rows, inflating totalFetched and D1 writes for no new data.
  if (opts.head !== false && budget > 0) {
    const headTo = new Date(nowMs).toISOString();
    const headFrom = new Date(nowMs - SYNC_CHUNK_DAYS * 86400000).toISOString();
    try {
      const headOrders = await fetchChunkWithRetry(adapter, conn.provider, headFrom, headTo);
      const windowed = headOrders.filter(
        (o) => !o.scheduledAt || (o.scheduledAt >= headFrom && o.scheduledAt <= headTo),
      );
      if (windowed.length > 0) {
        const up = await upsertOrders(db, orgId, conn.provider, windowed, nowSec, missing);
        await bumpCoverageCounters(db, orgId, up.newlyServiced, up.totalDelta);
        rowsUpserted += windowed.length;
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
  // Calendar cutoff for the 5-year history, extended back to January 1st of
  // the cutoff year so the starting year always syncs in full (Jan-Dec) and
  // can serve as the year-over-year base year. Windows ending on or before
  // the cutoff are never pulled; a straddling window is clamped to Jan 1st.
  const cutoff = new Date(nowMs);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - SYNC_HISTORY_YEARS);
  const jan1Ms = Date.UTC(cutoff.getUTCFullYear(), 0, 1);
  const jan1Iso = new Date(jan1Ms).toISOString();
  for (let i = 0; i < budget && !terminal; i += 1) {
    // Skip the window the head just covered on fresh workspaces (unless the
    // head failed, in which case the backfill re-covers it).
    const backIndex = syncedChunks + backDone + (headOk && syncedChunks === 0 ? 1 : 0);
    if (backIndex >= MAX_BACKFILL_CHUNKS) { finished = true; break; }
    // History already reaches the full starting year (or beyond, for seeds
    // parked mid-year by the old cutoff): nothing older is in scope. Uses
    // the run-start cursor, never the in-memory one, so a run in progress
    // cannot finish itself early.
    if (state.cursorDate) {
      const cursorMs = new Date(state.cursorDate).getTime();
      if (Number.isFinite(cursorMs) && cursorMs <= jan1Ms) { finished = true; break; }
    }
    const window = chunkRange(nowMs, backIndex);
    const to = window.to;
    let from = window.from;
    if (new Date(to).getTime() <= jan1Ms) { finished = true; break; }
    // A straddling window is clamped to Jan 1st, and it is the last window
    // in scope: fetching it completes the seed.
    let clamped = false;
    if (new Date(from).getTime() < jan1Ms) { from = jan1Iso; clamped = true; }
    try {
      const orders = await fetchChunkWithRetry(adapter, conn.provider, from, to);
      if (orders.length === 0) {
        emptyStreak += 1;
        chunksSynced += 1;
        backDone += 1;
        cursorDate = from;
        if (clamped || emptyStreak >= EMPTY_CHUNKS_TO_FINISH) { finished = true; break; }
        await checkpoint(cursorDate, (state.totalFetched ?? 0) + rowsUpserted);
        continue;
      }
      emptyStreak = 0;
      const up = await upsertOrders(db, orgId, conn.provider, orders, nowSec, missing);
      await bumpCoverageCounters(db, orgId, up.newlyServiced, up.totalDelta);
      rowsUpserted += orders.length;
      chunksSynced += 1;
      backDone += 1;
      cursorDate = from;
      if (clamped) {
        // Boundary window stored: everything older is out of scope, so the
        // seed is done now, not on some later run.
        finished = true;
        await checkpoint(cursorDate, (state.totalFetched ?? 0) + rowsUpserted);
        break;
      }
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
  //
  // Strict phases: while the backfill is unfinished this run fetches listing
  // windows only. Enrichment starts once the seed is complete (finished here,
  // or already live from an earlier run) — detail reads never compete with
  // history windows for the per-run vendor/CPU budget. Backfill links pass
  // enrich: false so the enrichment parent (or a later run) owns the backlog.
  let enriched = 0;
  let enrichFailed = 0;
  if (opts.enrich !== false && !terminal && (finished || state.status === "live")) {
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
  // Final state write with the same monotonic merge as checkpoints: re-read
  // the row so a stale overlapping run can neither regress the cursor nor
  // shrink the totals (which parked a live seed at 24.2k behind completed
  // links). Genuine errors still surface, and the next clean run clears
  // transient error text as before.
  const finalRows = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
  const fcur = finalRows[0];
  const finalCursor = mergeSyncCursor(fcur?.cursorDate ?? null, cursorDate);
  const finalFetched = mergeSyncFetched(fcur?.totalFetched, totalFetched);
  const finalStatus = mergeSyncStatus(fcur?.status, state.status, status);
  // Same preservation rule as checkpoints: the final write carries the
  // merged cursor/totals but never ordersTotal (delta-maintained).
  await db
    .insert(orgSyncState)
    .values({ organizationId: orgId, provider: conn.provider, status: finalStatus, cursorDate: finalCursor, lastSyncedAt: Math.floor(nowMs / 1000), totalFetched: finalFetched, errorText: error ?? null, updatedAt: Math.floor(nowMs / 1000), seedStartedAt, totalEstimate })
    .onConflictDoUpdate({ target: orgSyncState.organizationId, set: { provider: conn.provider, status: finalStatus, cursorDate: finalCursor, lastSyncedAt: Math.floor(nowMs / 1000), totalFetched: finalFetched, errorText: error ?? null, updatedAt: Math.floor(nowMs / 1000), seedStartedAt, totalEstimate } });

  return { orgId, provider: conn.provider, status: finalStatus, chunksSynced, rowsUpserted, enriched, enrichFailed, cursorDate: finalCursor, finished, error };
}

/**
 * Monotonic merge for concurrent-run state writes: overlapping runs
 * (links, ticks, clicks) must never move the cursor backward or shrink the
 * totals — last-writer-wins across concurrent runs otherwise regresses the
 * walk and parks the seed. ISO-8601 UTC cursors order lexicographically; a
 * null cursor carries no position. Pure and unit-tested.
 */
export function mergeSyncCursor(
  current: string | null,
  computed: string | null,
): string | null {
  if (!current) return computed;
  if (!computed) return current;
  return computed < current ? computed : current;
}

export function mergeSyncFetched(current: number | null | undefined, computed: number): number {
  return Math.max(current ?? 0, computed);
}

/**
 * A run that did not start live must not flip a live workspace back to
 * backfilling: its view predates whatever flipped it live. Genuine errors
 * still surface (fresh-live runs pass through untouched).
 */
export function mergeSyncStatus(
  currentStatus: string | null | undefined,
  runStartStatus: string,
  computedStatus: string,
): string {
  if (currentStatus === "live" && runStartStatus !== "live" && computedStatus === "backfilling") {
    return "live";
  }
  return computedStatus;
}

/** Seed a workspace in one continuous run (connect-time): walks the 5-year
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
export async function runBatch(db: Db, stmts: unknown[]): Promise<void> {
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
export interface EnrichOrderResult {
  orderId: string;
  items: BasketItem[];
}

/**
 * Bounded missing-service claim for fan-out parents: bare non-cancelled ISN
 * orders, newest first so recent dashboard periods fill before ancient
 * history. The inline tail below stays oldest-first (it feeds a merge sort);
 * this ordering serves parents that partition the claim across leaves.
 */
export async function claimMissingServiceIds(
  db: Db,
  orgId: string,
  limit: number,
): Promise<Array<{ providerOrderId: string; scheduledAt: string | null }>> {
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
    .orderBy(desc(orgOrders.scheduledAt))
    .limit(Math.max(1, Math.floor(limit)));
  return rows.map((r) => ({ providerOrderId: r.providerOrderId, scheduledAt: r.scheduledAt }));
}

/** Detail reads for explicit order ids. Skips nothing: the caller owns the
 * claim (inline existence filter or parent-partitioned sets). Failed reads
 * come back ok:false and retry later; empty successes come back with no
 * items and resolve to marker rows at write time. */
export async function fetchEnrichBatch(
  adapter: BusinessProviderAdapter,
  orgId: string,
  providerOrderIds: string[],
  concurrency: number,
): Promise<{ results: EnrichOrderResult[]; failed: number; firstError: string | null }> {
  const results: EnrichOrderResult[] = [];
  let failed = 0;
  let firstError: string | null = null;
  // Bounded worker pool: detail reads are network-bound, so a handful in
  // flight at once fills far faster than sequential fetches. Each order is
  // independent (deterministic statement ids), so completion order is moot.
  // Fees-only items: the basket mix sources exclusively from fee lines
  // (services[] names carry no amounts and would double-count the same
  // work); the zero-filter and marker rules in writeEnrichBatch apply.
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, providerOrderIds.length)) }, async () => {
    while (next < providerOrderIds.length) {
      const providerOrderId = providerOrderIds[next++]!;
      try {
        const detail = await adapter.getOrder(providerOrderId);
        const items = extractEnrichItems((detail?.details ?? {}) as Record<string, unknown>);
        results.push({ orderId: `${orgId}:isn:${providerOrderId}`, items });
      } catch (err) {
        // One unreadable order never blocks the rest; retried next drain.
        failed += 1;
        if (firstError === null) {
          firstError = err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
        }
      }
    }
  });
  await Promise.all(workers);
  return { results, failed, firstError };
}

/** Atomic coverage increments (migration 0040): single-statement UPDATEs, so
 * overlapping runs (links, leaves, ticks, clicks) can never lose each
 * other's deltas the way read-merge-write totals can. Skipped when both are
 * zero so hot paths that resolve nothing issue no write at all. The total
 * is floored at zero: transitions are balanced, but a floor keeps a stale
 * counter from inverting the backlog boolean. */
async function bumpCoverageCounters(db: Db, orgId: string, serviced: number, total: number): Promise<void> {
  if (serviced < 1 && total === 0) return;
  await db
    .update(orgSyncState)
    .set({
      ...(serviced > 0 ? { ordersWithServices: sql`${orgSyncState.ordersWithServices} + ${serviced}` } : {}),
      ...(total !== 0 ? { ordersTotal: sql`max(${orgSyncState.ordersTotal} + ${total}, 0)` } : {}),
    })
    .where(eq(orgSyncState.organizationId, orgId));
}

/** Back-compat wrapper: the enrichment writer only ever grows coverage. */
async function bumpServicesCovered(db: Db, orgId: string, n: number): Promise<void> {
  await bumpCoverageCounters(db, orgId, n, 0);
}

/** Replace-per-order service writes for fetched results (busy-retried by
 * callers that need it). Zero-amount lines are ignored; orders resolving to
 * nothing chargeable get the no-charge marker (counts as complete, never
 * re-claimed); failed reads were never fetched into results and retry
 * later. Returns orders resolved AND newly covered (the existence probe
 * keeps step retries idempotent: re-writing already-served orders bumps
 * nothing). */
export async function writeEnrichBatch(
  db: Db,
  orgId: string,
  results: EnrichOrderResult[],
): Promise<{ done: number; newlyResolved: number }> {
  // Newly-covered orders only: the probe is 90-sliced indexed reads (same
  // discipline as the enrichment claim check) and keeps the counter exact
  // across retried steps and overlapping drains.
  const have = new Set<string>();
  const orderIds = results.map((r) => r.orderId);
  for (let i = 0; i < orderIds.length; i += 90) {
    const slice = orderIds.slice(i, i + 90);
    if (slice.length === 0) break;
    const found = await db
      .select({ orderId: orgOrderServices.orderId })
      .from(orgOrderServices)
      .where(and(eq(orgOrderServices.organizationId, orgId), inArray(orgOrderServices.orderId, slice)));
    for (const r of found) have.add(r.orderId);
  }
  const newlyResolved = results.filter((r) => !have.has(r.orderId)).length;
  const stmts: unknown[] = [];
  for (const result of results) {
    const charged = result.items.filter((item) => item.amountMinor !== 0);
    stmts.push(db.delete(orgOrderServices).where(and(eq(orgOrderServices.organizationId, orgId), eq(orgOrderServices.orderId, result.orderId))));
    if (charged.length === 0) {
      stmts.push(
        db.insert(orgOrderServices).values({ id: `${result.orderId}:svc:${NO_CHARGE_MARKER}`, organizationId: orgId, orderId: result.orderId, name: NO_CHARGE_MARKER, kind: "base", amountMinor: 0 }).onConflictDoNothing(),
      );
    } else {
      charged.forEach((item, idx) => {
        stmts.push(
          db.insert(orgOrderServices).values({ id: `${result.orderId}:svc:${idx}`, organizationId: orgId, orderId: result.orderId, name: item.name, kind: item.kind, amountMinor: item.amountMinor }).onConflictDoNothing(),
        );
      });
    }
  }
  await runBatch(db, stmts);
  await bumpServicesCovered(db, orgId, newlyResolved);
  return { done: results.length, newlyResolved };
}

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
  const fetched = await fetchEnrichBatch(
    adapter,
    orgId,
    todo.map((m) => m.providerOrderId),
    concurrency,
  );
  const written = await writeEnrichBatch(db, orgId, fetched.results);
  return { done: written.done, failed: fetched.failed, attempted: todo.length, firstError: fetched.firstError };
}

/**
 * Next listing-link action from fresh sync state (self-healing: retries and
 * triggers always recompute instead of trusting a stale index). Mirrors the
 * walk arithmetic in runAnalyticsSyncForOrg for the link context (no head
 * window, no in-run progress): position is whole 90-day chunks from the
 * cursor, finished at the history floor or the chunk cap. A run that flips
 * the state itself (live/error) needs no link; terminal error parks the
 * walk until credentials are fixed (supervisor skips error states too).
 */
export async function deriveNextListingLink(
  db: Db,
  orgId: string,
  nowMs: number,
): Promise<{ action: "link"; backIndex: number } | { action: "finish" }> {
  const rows = await db.select().from(orgSyncState).where(eq(orgSyncState.organizationId, orgId)).limit(1);
  const state = rows[0];
  if (!state) return { action: "link", backIndex: 0 };
  if (state.status === "live" || state.status === "error") return { action: "finish" };
  let syncedChunks = 0;
  let cursorMs: number | null = null;
  if (state.cursorDate) {
    cursorMs = new Date(state.cursorDate).getTime();
    if (Number.isFinite(cursorMs)) syncedChunks = Math.max(0, Math.round((nowMs - cursorMs) / (SYNC_CHUNK_DAYS * 86400000)));
  }
  const cutoff = new Date(nowMs);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - SYNC_HISTORY_YEARS);
  const jan1Ms = Date.UTC(cutoff.getUTCFullYear(), 0, 1);
  if (syncedChunks >= MAX_BACKFILL_CHUNKS) return { action: "finish" };
  if (cursorMs !== null && Number.isFinite(cursorMs) && cursorMs <= jan1Ms) return { action: "finish" };
  const windowTo = new Date(nowMs - syncedChunks * SYNC_CHUNK_DAYS * 86400000).toISOString();
  if (new Date(windowTo).getTime() <= jan1Ms) return { action: "finish" };
  return { action: "link", backIndex: syncedChunks };
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
): Promise<{ newlyServiced: number; totalDelta: number }> {
  // Change detection: steady-state heads re-fetch thousands of unchanged
  // rows every run, and each upsert costs ~7 D1 writes (row + indexes).
  // Bulk-read the stored fingerprints first (90-sliced IN queries — reads
  // are 50x cheaper than writes in the budget) and skip identical rows
  // entirely. Fingerprint covers exactly the ON CONFLICT SET columns (plus
  // keys implicitly); syncedAt is deliberately excluded (write-only, never
  // read, so its staleness on skipped rows is unobservable).
  const wanted = [...new Set(orders.map((o) => String(o.id)))];
  const stored = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 90) {
    const slice = wanted.slice(i, i + 90);
    const rows = await db
      .select({
        providerOrderId: orgOrders.providerOrderId,
        status: orgOrders.status,
        scheduledAt: orgOrders.scheduledAt,
        completedAt: orgOrders.completedAt,
        totalMinor: orgOrders.totalMinor,
        inspectorNames: orgOrders.inspectorNames,
        serviceType: orgOrders.serviceType,
        buyerName: orgOrders.buyerName,
        buyingAgentName: orgOrders.buyingAgentName,
        buyingAgentEmail: orgOrders.buyingAgentEmail,
        buyingAgentPhone: orgOrders.buyingAgentPhone,
        agentKey: orgOrders.agentKey,
        sellingAgentName: orgOrders.sellingAgentName,
      })
      .from(orgOrders)
      .where(
        and(
          eq(orgOrders.organizationId, orgId),
          eq(orgOrders.provider, provider),
          inArray(orgOrders.providerOrderId, slice),
        ),
      );
    for (const r of rows) {
      stored.set(r.providerOrderId, JSON.stringify([
        r.status, r.scheduledAt ?? null, r.completedAt ?? null, r.totalMinor ?? null,
        r.inspectorNames, r.serviceType ?? null, r.buyerName ?? null,
        r.buyingAgentName ?? null, r.buyingAgentEmail ?? null, r.buyingAgentPhone ?? null,
        r.agentKey ?? null, r.sellingAgentName ?? null,
      ]));
    }
  }
  // Existing basket signatures for the same rows: listing services can change
  // while every order field stays identical, and without this the skip would
  // leave stale service rows behind. Same 90-slice discipline (reads are 50x
  // cheaper than writes in the budget).
  const storedBasket = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 90) {
    const slice = wanted.slice(i, i + 90);
    const ids = slice.map((providerOrderId) => `${orgId}:${provider}:${providerOrderId}`);
    const rows = await db
      .select({
        orderId: orgOrderServices.orderId,
        name: orgOrderServices.name,
        kind: orgOrderServices.kind,
        amountMinor: orgOrderServices.amountMinor,
      })
      .from(orgOrderServices)
      .where(and(eq(orgOrderServices.organizationId, orgId), inArray(orgOrderServices.orderId, ids)));
    const byOrder = new Map<string, Array<[string, string, number | null]>>();
    for (const r of rows) {
      const list = byOrder.get(r.orderId) ?? [];
      list.push([r.name, r.kind, r.amountMinor ?? null]);
      byOrder.set(r.orderId, list);
    }
    for (const [orderId, list] of byOrder) {
      storedBasket.set(orderId, JSON.stringify(list.map((e) => JSON.stringify(e)).sort()));
    }
  }
  // Collect first, write in batches: per-statement round trips make busy
  // chunks (thousands of writes) take minutes on D1. Order is preserved, so
  // each order's service delete still precedes its inserts.
  const stmts: unknown[] = [];
  // Orders whose listing carries charged services AND had no service rows
  // stored: the seed resolves them, so they count as covered (the
  // enrichment claim probe skips served orders, keeping this exact across
  // re-seeds; unchanged rows `continue` above before reaching this).
  let newlyServiced = 0;
  // orders_total tracks non-cancelled rows only (the backlog boolean reads
  // covered < total): new rows count unless cancelled, status transitions
  // adjust, unchanged rows `continue` above so re-processing never double
  // counts. Manual SQL purges bypass this — a reseed resets both counters,
  // same as total_fetched.
  let totalDelta = 0;
  for (const o of orders) {
    const inspectors = splitPeople(o.inspectorName);
    const scheduledAt = typeof o.scheduledAt === "string" ? o.scheduledAt : null;
    const id = `${orgId}:${provider}:${o.id}`;
    const details = (o.details ?? {}) as Record<string, unknown>;
    const { email: agentEmail, phone: agentPhone } = extractAgentContact(details);
    const agentKey = toAgentKey(agentEmail, agentPhone);
    const basket = extractBasket(details, o.serviceType);
    const charged = basket.filter((item) => item.amountMinor !== 0);
    const basketSig = JSON.stringify(charged.map((item) => JSON.stringify([item.name, item.kind, item.amountMinor])).sort());
    const fingerprint = JSON.stringify([
      typeof o.status === "string" ? o.status.toLowerCase() : "scheduled",
      scheduledAt,
      typeof o.completedAt === "string" ? o.completedAt : null,
      typeof o.total === "number" ? o.total : null,
      JSON.stringify(inspectors),
      typeof o.serviceType === "string" ? o.serviceType : null,
      typeof o.buyerName === "string" ? o.buyerName : null,
      typeof o.buyingAgentName === "string" ? o.buyingAgentName : null,
      agentEmail,
      agentPhone,
      agentKey,
      typeof o.sellingAgentName === "string" ? o.sellingAgentName : null,
    ]);
    // The listing path never deletes service rows on an empty basket
    // (enrichment owns those), so an empty incoming basket always compares
    // equal here regardless of stored rows.
    const basketSame = charged.length === 0 || (storedBasket.get(id) ?? "[]") === basketSig;
    const prev = stored.get(String(o.id));
    if (prev === fingerprint && basketSame) {
      // Unchanged: skip all writes for this row (order, junction, basket).
      // Bare ISN rows are still reported for enrichment: the existence probe
      // filters already-served ones, so this costs nothing downstream.
      if (charged.length === 0 && provider === "isn") {
        missing?.push({ providerOrderId: String(o.id), scheduledAt });
      }
      continue;
    }
    // Coverage total delta (non-cancelled rows only): genuinely new rows
    // count unless cancelled; a status flip adjusts. Reached only for rows
    // that will actually be written, so identical re-processing (which
    // `continue`s above) can never double-count.
    const nowCancelled = (typeof o.status === "string" ? o.status.toLowerCase() : "scheduled") === "cancelled";
    if (prev === undefined) {
      if (!nowCancelled) totalDelta += 1;
    } else {
      try {
        const wasCancelled = (JSON.parse(prev) as unknown[])[0] === "cancelled";
        if (!wasCancelled && nowCancelled) totalDelta -= 1;
        else if (wasCancelled && !nowCancelled) totalDelta += 1;
      } catch {
        // Fingerprint unreadable: leave the total alone rather than guess.
      }
    }
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
          agentKey,
          sellingAgentName: typeof o.sellingAgentName === "string" ? o.sellingAgentName : null,
          serviceType: typeof o.serviceType === "string" ? o.serviceType : null,
          referralSource: typeof o.referralSource === "string" ? o.referralSource : null,
          address: typeof o.address === "string" ? o.address : null,
          providerUpdatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
          syncedAt: nowSec,
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
            buyerName: typeof o.buyerName === "string" ? o.buyerName : null,
            buyingAgentName: typeof o.buyingAgentName === "string" ? o.buyingAgentName : null,
            buyingAgentEmail: agentEmail,
            buyingAgentPhone: agentPhone,
            agentKey,
            sellingAgentName: typeof o.sellingAgentName === "string" ? o.sellingAgentName : null,
            syncedAt: nowSec,
          },
        }),
    );

    // Inspector junction: replace per order so re-syncs never duplicate and
    // removed inspectors lose credit. Unlike services (which ISN enriches
    // from detail reads), inspector names always arrive on the listing, so
    // the delete is unconditional. Keeps inspector_names JSON for
    // back-compat; SQL aggregates read this table.
    stmts.push(db.delete(orgOrderInspectors).where(and(eq(orgOrderInspectors.organizationId, orgId), eq(orgOrderInspectors.orderId, id))));
    for (const name of inspectors) {
      stmts.push(
        db.insert(orgOrderInspectors).values({ organizationId: orgId, orderId: id, inspectorName: name }).onConflictDoNothing(),
      );
    }

    // Basket items: replace per order so re-syncs never duplicate. Rows with
    // no service info leave existing rows alone: ISN `/json` windows carry
    // no services, and wiping here would delete what the enrichment pass
    // below already captured from per-order detail reads. Zero-amount lines
    // are ignored like in the enrichment pass; an all-zero listing defers
    // to enrichment (which marks) instead of writing marker rows itself
    // (`charged` computed above for the change-detection signature).
    if (charged.length > 0) {
      if (!storedBasket.has(id)) newlyServiced += 1;
      stmts.push(db.delete(orgOrderServices).where(and(eq(orgOrderServices.organizationId, orgId), eq(orgOrderServices.orderId, id))));
      charged.forEach((item, svcIdx) => {
        // Do-nothing on conflict: concurrent runs (tab driver plus cron) may
        // interleave the same deterministic ids; the content is identical.
        stmts.push(
          db.insert(orgOrderServices).values({ id: `${id}:svc:${svcIdx}`, organizationId: orgId, orderId: id, name: item.name, kind: item.kind, amountMinor: item.amountMinor }).onConflictDoNothing(),
        );
      });
    } else if (provider === "isn") {
      missing?.push({ providerOrderId: String(o.id), scheduledAt });
    }
  }
  await runBatch(db, stmts);
  return { newlyServiced, totalDelta };
  void orgDashboardLayouts;
  void orgInspectorTargets;
}
