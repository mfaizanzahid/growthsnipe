import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../repositories/db";
import type { Env, SyncWorkflowBinding } from "../lib/env";
import type { BusinessProviderAdapter, ProviderKey } from "../providers/types";
import { createProviderAdapter } from "../providers/registry";
import { decryptJson } from "../lib/crypto";
import { writeAppLog } from "../lib/app-logs";
import {
  claimMissingServiceIds,
  claimRunLease,
  deriveNextListingLink,
  hasEnrichmentBacklog,
  loadOrgProvider,
  releaseRunLease,
  runAnalyticsSyncForOrg,
} from "./sync";
import { appLogs, orgSyncState } from "../../../db/schema";

/**
 * Workflow task layer: every long-running sync primitive as an importable,
 * node-safe async function. The thin `sync-workflow.ts` shell only wires
 * these into WorkflowEntrypoint steps (sleeps, retries, NonRetryableError),
 * so all logic below is unit-tested with sqlite-proxy exactly like sync.ts.
 *
 * Free-tier design (verified docs, strict reading): no instance ever issues
 * more than ~50 subrequests — enrichment leaves take at most 45 orders,
 * parents fan out at most 50 leaves per wave (createBatch caps at 100, and
 * free allows 100 concurrent instances), listing links do one window each.
 * A 25k-order seed costs roughly 550 leaves x 2 steps plus links and parent
 * cycles (~1,200 steps/day against the 3,000 budget). Duplicates are
 * absorbed by idempotent writes, never by locking.
 */

/** Fatal configuration/auth failure: the shell converts it to NonRetryableError. */
export class TerminalSyncError extends Error {}

/** D1 daily quota hit: the shell sleeps to 00:05 UTC, then retries once. */
export class D1QuotaError extends Error {}

export function workflowChunkSize(env: Pick<Env, "SYNC_WORKFLOW_CHUNK"> | undefined): number {
  const n = Number.parseInt(env?.SYNC_WORKFLOW_CHUNK?.trim() ?? "", 10);
  if (!Number.isFinite(n)) return 45;
  return Math.max(1, Math.min(45, Math.floor(n)));
}

export function workflowFanout(env: Pick<Env, "SYNC_WORKFLOW_FANOUT"> | undefined): number {
  const n = Number.parseInt(env?.SYNC_WORKFLOW_FANOUT?.trim() ?? "", 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export function workflowChildConcurrency(env: Pick<Env, "SYNC_WORKFLOW_CHILD_CONCURRENCY"> | undefined): number {
  const n = Number.parseInt(env?.SYNC_WORKFLOW_CHILD_CONCURRENCY?.trim() ?? "", 10);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(8, Math.floor(n)));
}

export function workflowPaceSeconds(env: Pick<Env, "SYNC_WORKFLOW_PACE_SECONDS"> | undefined): number {
  const n = Number.parseInt(env?.SYNC_WORKFLOW_PACE_SECONDS?.trim() ?? "", 10);
  if (!Number.isFinite(n)) return 60;
  return Math.max(0, Math.min(3600, Math.floor(n)));
}

function utcDate(nowMs: number): string {
  const d = new Date(nowMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/** Deterministic, id-charset-safe instance ids (org ids are nanoids). */
export function enrichParentId(orgId: string, nowMs: number): string {
  return `enr-${orgId}-${utcDate(nowMs)}`;
}

/**
 * Unique tag per parent run: without it, a parent's second fan-out cycle
 * reuses the first cycle's leaf ids and createBatch throws on the
 * duplicates (a completed instance still occupies its id), erroring the
 * whole parent with most of the backlog unclaimed. Generated inside a step
 * so replays reuse the recorded value.
 */
export function enrichRunTag(nowMs: number): string {
  return `${utcDate(nowMs)}-${nowMs.toString(36)}`;
}

/** Leaf ids carry the cycle: chunk indexes restart at 0 every cycle, so the
 * run tag alone would collide across cycles of one parent run. */
export function enrichLeafId(orgId: string, runTag: string, cycle: number, index: number): string {
  return `enr-${orgId}-${runTag}-${cycle}-${index}`;
}

export function listingLinkId(orgId: string, backIndex: number): string {
  return `lst-${orgId}-${backIndex}`;
}

/** Split ids into deterministic chunks, order preserved. */
export function partitionIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Deterministic stagger so a fan-out wave does not thundering-herd. */
export function jitterMs(index: number): number {
  return (index % 10) * 3000;
}

export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /exceeded.*daily.*row.*(read|write).*limit|daily.*limit.*exceeded|quota/i.test(msg);
}

export function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /busy|locked/i.test(msg);
}

/** Milliseconds until 00:05 UTC past midnight: quota-resume point. */
export function msUntilUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5);
  return Math.max(0, next - nowMs);
}

const ACTIVE_STATUSES = new Set(["running", "waiting", "queued", "paused", "waitingForPause"]);

/**
 * Get-or-create with delete-on-terminal: active instances are reused, dead
 * ones are deleted and recreated under the same deterministic id, missing
 * ones are created. A lost create race falls back to re-reading.
 *
 * An unreadable status is treated as dead, not alive: reusing a possibly
 * wedged instance would park that id forever, while recreating is safe
 * (all bodies are idempotent, leaf ids carry a per-run nonce). If the
 * instance is actually alive, create throws on the occupied id and we
 * fall back to reusing it.
 */
export async function getOrCreateInstance(
  binding: SyncWorkflowBinding,
  id: string,
  params: unknown,
): Promise<{ id: string; reused: boolean }> {
  const existing = await binding.get(id).catch(() => null);
  if (existing) {
    const st = await existing.status().catch(() => null);
    if (st && ACTIVE_STATUSES.has(st.status)) return { id: existing.id, reused: true };
    console.log(`[sync] replacing instance ${id} (status=${st?.status ?? "unreadable"})`);
    await existing.delete().catch(() => {});
  }
  try {
    const created = await binding.create({ id, params });
    return { id: created.id, reused: false };
  } catch {
    // Lost a creation race: reuse whatever is there now.
    const current = await binding.get(id);
    return { id: current.id, reused: true };
  }
}

export interface OrgAdapter {
  provider: ProviderKey;
  adapter: BusinessProviderAdapter;
}

/** Load connection, decrypt credentials, build the vendor adapter. */
export async function buildOrgAdapter(
  env: Pick<Env, "MCP_ENCRYPTION_KEY">,
  db: Db,
  orgId: string,
): Promise<OrgAdapter | null> {
  const conn = await loadOrgProvider(db, orgId);
  if (!conn) return null;
  if (!env.MCP_ENCRYPTION_KEY) throw new TerminalSyncError("Missing MCP_ENCRYPTION_KEY");
  const creds = await decryptJson<Record<string, string>>(env.MCP_ENCRYPTION_KEY, conn.credentials.__encrypted);
  return { provider: conn.provider, adapter: createProviderAdapter(env as Env, { provider: conn.provider, credentials: creds }) };
}

export interface EnrichParentCycle {
  /** Missing ids claimed this cycle (capped). Empty means drained. */
  claimed: number;
  /** Leaf instance ids spawned (or reused) this cycle. */
  leaves: string[];
  done: boolean;
}

/** Missing ids claimed per parent cycle (~72KB worst case, far under 1MiB). */
export const ENRICH_CLAIM_CAP = 2000;

/**
 * One enrichment fan-out wave: claim up to `claimCap` missing order ids,
 * partition into chunks, spawn one leaf per chunk via createBatch. Returns
 * done when the claim comes back empty. ISN-only, like the inline tail.
 * Writes a heartbeat row so a stalled parent is distinguishable from a live
 * one (see latestParentHeartbeat).
 */
export async function runEnrichParentCycle(
  binding: SyncWorkflowBinding,
  db: Db,
  orgId: string,
  provider: ProviderKey,
  chunkSize: number,
  claimCap: number,
  fanout: number,
  runTag: string,
  cycle: number,
): Promise<EnrichParentCycle> {
  if (provider !== "isn") return { claimed: 0, leaves: [], done: true };
  const missing = await claimMissingServiceIds(db, orgId, claimCap);
  if (missing.length === 0) return { claimed: 0, leaves: [], done: true };
  const chunks = partitionIds(
    missing.map((m) => m.providerOrderId),
    chunkSize,
  ).slice(0, Math.max(1, fanout));
  const batch = chunks.map((orderIds, i) => ({
    id: enrichLeafId(orgId, runTag, cycle, i),
    params: { kind: "enrich-leaf", orgId, orderIds, index: i },
  }));
  const handles = await binding.createBatch(batch);
  await writeAppLog(db, { level: "info", event: "sync.parent_cycle", surface: "cron", message: `Parent cycle ${cycle}: claimed=${missing.length} leaves=${handles.length}`, orgId }).catch(() => {});
  return { claimed: missing.length, leaves: handles.map((h) => h.id), done: false };
}

/**
 * Enrichment-parent heartbeat: an active parent record with no recent
 * heartbeat is a zombie (execution lost, e.g., dev restart) and must be
 * reaped, or the backlog parks forever behind a `running` record that
 * every trigger reuses. Heartbeats are app_logs rows (no migration):
 * `sync.parent_created` at creation, `sync.parent_cycle` per wave.
 * 10 minutes is generous (a healthy parent beats every ~1-2 min).
 */
export const ENRICH_PARENT_STALE_MS = 10 * 60 * 1000;

export async function latestParentHeartbeat(db: Db, orgId: string): Promise<number | null> {
  const rows = await db
    .select({ createdAt: appLogs.createdAt })
    .from(appLogs)
    .where(and(eq(appLogs.orgId, orgId), inArray(appLogs.event, ["sync.parent_cycle", "sync.parent_created"])))
    .orderBy(desc(appLogs.createdAt))
    .limit(1);
  return rows.length > 0 ? rows[0].createdAt : null;
}

/**
 * Ensure the dated enrichment parent, replacing terminal ones, creating
 * when missing — and reaping zombies. Returns null when there is
 * no backlog (checked first, one indexed read).
 */
export async function ensureEnrichmentParent(
  binding: SyncWorkflowBinding | undefined,
  db: Db,
  orgId: string,
  provider: ProviderKey,
  nowMs: number,
): Promise<{ id: string; reused: boolean } | null> {
  if (!binding || provider !== "isn") return null;
  if (!(await hasEnrichmentBacklog(db, orgId))) return null;
  const parentId = enrichParentId(orgId, nowMs);
  const found = await binding.get(parentId).catch(() => null);
  if (found) {
    const st = await found.status().catch(() => null);
    if (st && ACTIVE_STATUSES.has(st.status)) {
      const beat = await latestParentHeartbeat(db, orgId).catch(() => nowMs);
      if (beat !== null && nowMs - beat < ENRICH_PARENT_STALE_MS) {
        return { id: found.id, reused: true };
      }
      console.log(`[sync] replacing stalled parent ${parentId} (status=${st.status})`);
      await found.delete().catch(() => {});
    }
  }
  const out = await getOrCreateInstance(binding, parentId, { kind: "enrich-parent", orgId });
  if (!out.reused) {
    await writeAppLog(db, { level: "info", event: "sync.parent_created", surface: "cron", message: "Enrichment parent created", orgId }).catch(() => {});
  }
  return out;
}

/**
 * Ensure the listing link for the next backfill window from fresh state.
 * Returns null when the walk is finished (the run itself flips the state;
 * the supervisor then owns parent creation from the backlog probe).
 */
export async function ensureListingLink(
  binding: SyncWorkflowBinding | undefined,
  db: Db,
  orgId: string,
  nowMs: number,
): Promise<{ id: string; reused: boolean } | null> {
  if (!binding) return null;
  const next = await deriveNextListingLink(db, orgId, nowMs);
  if (next.action === "finish") return null;
  return getOrCreateInstance(binding, listingLinkId(orgId, next.backIndex), {
    kind: "listing-link",
    orgId,
    backIndex: next.backIndex,
  });
}

/**
 * One backfill window as a Workflow link: the identical chunk statements
 * as the inline loop for the first unfinished window, without head or
 * enrichment (the parent owns the backlog; heads are cron-inline).
 */
export async function runListingLinkBody(
  env: Env,
  db: Db,
  orgId: string,
  nowMs: number,
  adapter?: BusinessProviderAdapter,
): Promise<{ finished: boolean }> {
  const org = adapter ? null : await buildOrgAdapter(env, db, orgId);
  const useAdapter = adapter ?? org?.adapter;
  if (!useAdapter) return { finished: true };
  const summary = await runAnalyticsSyncForOrg(env, db, orgId, {
    maxChunks: 1,
    head: false,
    enrich: false,
    adapter: useAdapter,
    nowMs,
  });
  return { finished: summary.finished };
}

/**
 * Minutely supervisor for workflow mode: cheap checks, no burst work.
 * Backfilling orgs get their listing link ensured (the chain walks itself);
 * live orgs get an enrichment parent whenever a backlog exists; drained
 * live orgs get an inline hourly head (step-free steady state — workflows
 * only ever do bursts). Error states are parked (terminal credentials).
 * One bad org never kills the tick. runHead is an injectable seam so tests
 * never touch the vendor.
 */
export async function runWorkflowSupervisor(
  binding: SyncWorkflowBinding | undefined,
  env: Env,
  db: Db,
  nowMs: number,
  runHead?: (orgId: string) => Promise<void>,
): Promise<{ links: number; parents: number; heads: number }> {
  const states = await db.select().from(orgSyncState).limit(20);
  const hourAgo = Math.floor(nowMs / 1000) - 3600;
  let links = 0;
  let parents = 0;
  let heads = 0;
  const doHead =
    runHead ??
    (async (orgId: string) => {
      if (!(await claimRunLease(db, orgId, nowMs))) return;
      try {
        await runAnalyticsSyncForOrg(env, db, orgId, { maxChunks: 1, head: true, enrich: false, nowMs });
      } finally {
        await releaseRunLease(db, orgId, nowMs);
      }
    });
  for (const s of states) {
    try {
      if (s.status === "backfilling") {
        const link = await ensureListingLink(binding, db, s.organizationId, nowMs);
        if (link) links += 1;
      } else if (s.status === "live") {
        const org = await buildOrgAdapter(env, db, s.organizationId).catch(() => null);
        if (org) {
          const parent = await ensureEnrichmentParent(binding, db, s.organizationId, org.provider, nowMs);
          if (parent && !parent.reused) parents += 1;
        }
        const stale = (s.lastSyncedAt ?? 0) < hourAgo;
        const draining = stale ? false : await hasEnrichmentBacklog(db, s.organizationId);
        if (stale || draining) {
          await doHead(s.organizationId);
          heads += 1;
        }
      }
      if (heads >= 5) break;
    } catch {
      // One bad org never kills the tick.
      continue;
    }
  }
  return { links, parents, heads };
}
