import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/lib/env";
import type { BusinessProviderAdapter, OrderRecord } from "../src/server/providers/types";
import { encryptJson } from "../src/server/lib/crypto";
import { backfillProgress, claimRunLease, extractBasket, hasEnrichmentBacklog, releaseRunLease, runAnalyticsSyncForOrg } from "../src/server/analytics/sync";
import { extractAgentContact } from "../src/server/analytics/sync";

const KEY = "test-sync-key-must-be-long-enough-1234";
const ORG = "o1";
const NOW = new Date("2026-10-23T12:00:00.000Z").getTime();

function memoryDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE sidekick_connections (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider TEXT NOT NULL,
      encrypted_credentials TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'connected',
      capabilities_json TEXT, external_account_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX sidekick_connections_org_provider_idx ON sidekick_connections (organization_id, provider);
    CREATE TABLE org_sync_state (
      organization_id TEXT PRIMARY KEY, provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backfilling', cursor_date TEXT,
      last_synced_at INTEGER, total_fetched INTEGER NOT NULL DEFAULT 0,
      error_text TEXT, updated_at INTEGER NOT NULL,
      seed_started_at INTEGER, total_estimate INTEGER
    );
    CREATE TABLE org_orders (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider TEXT NOT NULL,
      provider_order_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
      scheduled_at TEXT, completed_at TEXT, total_minor INTEGER,
      currency TEXT NOT NULL DEFAULT 'USD', inspector_names TEXT NOT NULL DEFAULT '[]',
      buyer_name TEXT, buyer_email TEXT, buyer_phone TEXT,
      buying_agent_name TEXT, buying_agent_email TEXT, buying_agent_phone TEXT,
      agent_key TEXT,
      selling_agent_name TEXT, service_type TEXT, referral_source TEXT, address TEXT,
      provider_updated_at TEXT, synced_at INTEGER NOT NULL, raw_json TEXT
    );
    CREATE UNIQUE INDEX org_orders_org_provider_order_idx ON org_orders (organization_id, provider, provider_order_id);
    CREATE INDEX IF NOT EXISTS org_orders_org_sched_id_idx ON org_orders (organization_id, scheduled_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS org_orders_org_status_sched_idx ON org_orders (organization_id, status, scheduled_at);
    CREATE INDEX IF NOT EXISTS org_orders_org_agent_sched_idx ON org_orders (organization_id, agent_key, scheduled_at);
    CREATE TABLE IF NOT EXISTS org_order_inspectors (
      organization_id TEXT NOT NULL, order_id TEXT NOT NULL, inspector_name TEXT NOT NULL,
      PRIMARY KEY (organization_id, order_id, inspector_name)
    );
    CREATE TABLE org_order_services (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, order_id TEXT NOT NULL,
      name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'base', amount_minor INTEGER
    );
    CREATE TABLE org_agents (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT, email TEXT, phone TEXT,
      first_seen_at TEXT, last_seen_at TEXT, order_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  return drizzle(
    async (sql: string, params: unknown[]) => {
      const statement = sqlite.prepare(sql);
      const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
      return { rows: objectRows.map((row) => Object.values(row)) };
    },
    { schema },
  ) as unknown as Db;
}

async function seedConnection(db: Db, provider: "spectora" | "isn" = "spectora") {
  const blob = await encryptJson(KEY, provider === "isn" ? { companyKey: "c", host: "h", accessKey: "a", secretKey: "s" } : { apiKey: "test-key" });
  // Raw insert: the proxy path only needs the columns loadOrgProvider reads.
  await db.insert(schema.sidekickConnections).values({
    id: "c1",
    organizationId: ORG,
    provider,
    encryptedCredentials: blob,
    status: "connected",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  });
}

const env = { MCP_ENCRYPTION_KEY: KEY } as unknown as Env;

/**
 * A completed seed: cursor at/below the history cutoff so the run computes
 * finished immediately. Enrichment only engages on finished or live runs
 * (strict phases: backfill first, then enrich), so enrichment tests seed
 * this instead of a fresh backfilling workspace.
 */
async function seedLiveState(db: Db) {
  await db.insert(schema.orgSyncState).values({
    organizationId: ORG,
    provider: "isn",
    status: "live",
    cursorDate: "2020-01-01T00:00:00.000Z",
    updatedAt: 1,
  });
}

function order(id: string, scheduledAt: string): OrderRecord {
  return {
    id,
    status: "completed",
    scheduledAt,
    total: 50000,
    currency: "USD",
    inspectorName: "Sam",
    buyingAgentName: "Agent A",
    details: { buyingAgentEmail: "a@example.com", serviceNames: "Home Inspection" },
  };
}

function fakeAdapter(impl: Partial<BusinessProviderAdapter> & { calls?: Array<{ from: string; to: string }> }): BusinessProviderAdapter {
  return {
    key: "spectora",
    capabilities: async () => ({ provider: "spectora", read: [], write: [] }),
    searchClients: async () => ({ items: [] }),
    getClient: async () => null,
    searchOrders: async (input: { from?: string; to?: string }) => {
      impl.calls?.push({ from: input.from ?? "", to: input.to ?? "" });
      return { items: [] };
    },
    getOrder: async () => null,
    searchAgents: async () => ({ items: [] }),
    getAgent: async () => null,
    searchEvents: async () => ({ items: [] }),
    ...impl,
  } as unknown as BusinessProviderAdapter;
}

describe("backfill progress", () => {
  // NOW is 2026-10-23T12:00Z: position is whole 90-day chunks from the
  // cursor, clamped to the 21-chunk walk; live is always complete.
  it("derives walk position from the cursor, complete when live", () => {
    expect(backfillProgress(null, "backfilling", NOW)).toEqual({ done: 0, total: 25 });
    expect(backfillProgress("2026-10-01T00:00:00.000Z", "backfilling", NOW)).toEqual({ done: 0, total: 25 });
    expect(backfillProgress("2021-11-27T12:00:00.000Z", "backfilling", NOW)).toEqual({ done: 20, total: 25 });
    expect(backfillProgress("2014-06-30T12:00:00.000Z", "backfilling", NOW)).toEqual({ done: 25, total: 25 });
    expect(backfillProgress(null, "live", NOW)).toEqual({ done: 25, total: 25 });
    expect(backfillProgress("garbage", "backfilling", NOW)).toEqual({ done: 0, total: 25 });
  });
});

describe("agent contact extraction", () => {
  it("reads Spectora camelCase keys", () => {
    expect(extractAgentContact({ buyingAgentEmail: "A@x.com", buyingAgentPhone: "(555) 123-4567" })).toEqual({
      email: "a@x.com",
      phone: "5551234567",
    });
  });

  it("reads ISN /json snake_case keys (live-probed 2026-10-23)", () => {
    expect(extractAgentContact({ agent_display: "Daniel Cardoso", agent_email: "d@example.com", agent_mobile: "5616212920" })).toEqual({
      email: "d@example.com",
      phone: "5616212920",
    });
  });

  it("returns nulls when only reference UUIDs are present (ISN /rest shape)", () => {
    expect(extractAgentContact({ buyersagent: "f1625e69-60ff-442d-b4aa-43e3908ef862", inspector1: "9f3b2c1d-aaaa-bbbb-cccc-ddeeff001122" })).toEqual({
      email: null,
      phone: null,
    });
  });
});

describe("basket extraction", () => {
  it("splits Spectora serviceNames and serviceAddOnNames", () => {
    expect(
      extractBasket({ serviceNames: "General Home Inspection, Radon", serviceAddOnNames: "Radon, WDO" }, undefined),
    ).toEqual([
      { name: "General Home Inspection", kind: "base" },
      { name: "Radon", kind: "base" },
      { name: "WDO", kind: "addon" },
    ]);
  });

  it("reads ISN detail services and packages, skipping hidden rows", () => {
    expect(
      extractBasket(
        {
          services: [
            { uuid: "a", name: "General Home Inspection" },
            { uuid: "b", name: "Wind Mitigation - w/ HI" },
          ],
          packages: [
            { id: "p1", name: "Buyer's Complete Bundle", show: "yes" },
            { id: "p2", name: "Deleted Bundle", show: "no" },
          ],
          fees: [{ id: "f1", amount: 0, name: "FlexFund Fee" }],
        },
        undefined,
      ),
    ).toEqual([
      { name: "General Home Inspection", kind: "base" },
      { name: "Wind Mitigation - w/ HI", kind: "base" },
      { name: "Buyer's Complete Bundle", kind: "package" },
    ]);
  });

  it("returns no rows when the listing carries no service info", () => {
    expect(extractBasket({}, null)).toEqual([]);
  });

  it("falls back to fee names on old ISN orders with empty services", () => {
    // Live-probed 2026-10-24: decade-old ISN details return services: [] and
    // packages: [] while fees[] still names the work performed.
    expect(
      extractBasket(
        {
          services: [],
          packages: [],
          fees: [
            { id: "0ad1e11c", amount: 389, name: "General Home Inspection" },
            { id: "c359b7d4", amount: 0, name: "Wind Mitigation with Home Inspection" },
          ],
        },
        undefined,
      ),
    ).toEqual([
      { name: "General Home Inspection", kind: "base" },
      { name: "Wind Mitigation with Home Inspection", kind: "base" },
    ]);
  });

  it("prefers services over fees when both are present", () => {
    expect(
      extractBasket(
        {
          services: [{ uuid: "u", name: "General Home Inspection" }],
          fees: [{ id: "f", amount: 10, name: "FlexFund Fee" }],
        },
        undefined,
      ),
    ).toEqual([{ name: "General Home Inspection", kind: "base" }]);
  });
});

describe("analytics sync resilience", () => {
  it("retries a transient chunk failure within one run", async () => {
    const db = memoryDb();
    await seedConnection(db);
    let listingAttempts = 0;
    const adapter = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        listingAttempts += 1;
        if (listingAttempts < 3) throw new Error("ISN /json/orders returned a non-JSON response (HTTP 200)");
        return { items: [order("1", new Date(NOW - 86400000).toISOString())] };
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(listingAttempts).toBe(3);
    expect(summary.error).toBeUndefined();
    expect(summary.rowsUpserted).toBe(1);
  }, 30000);

  it("keeps backfilling (not terminal error) when a chunk keeps failing, without advancing the cursor", async () => {
    const db = memoryDb();
    await seedConnection(db);
    // Head window succeeds; anything older keeps failing. The head and the
    // first backfill chunk cover the same window, so failures are identified
    // by windows strictly older than the head.
    const headFrom = new Date(NOW - 90 * 86400000).toISOString();
    const seen: Array<{ from: string; to: string }> = [];
    const flakyOld = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        seen.push({ from: input.from ?? "", to: input.to ?? "" });
        if ((input.from ?? "") < headFrom) throw new Error("ISN /json/orders returned a non-JSON response (HTTP 200)");
        return { items: [] };
      },
    });
    const first = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 2, nowMs: NOW, adapter: flakyOld });
    expect(first.status).toBe("backfilling");
    expect(first.error).toContain("non-JSON");
    expect(first.finished).toBe(false);
    const second = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 2, nowMs: NOW, adapter: flakyOld });
    expect(second.status).toBe("backfilling");
    // Only older windows failed, and the retry asks the same one again:
    // the cursor never advanced past the failed window.
    const failed = seen.filter((c) => c.from < headFrom);
    expect(failed.length).toBeGreaterThan(1);
    expect(failed[failed.length - 1]).toEqual(failed[0]);
    const state = await db.select().from(schema.orgSyncState);
    expect(state[0]?.cursorDate).toBeNull();
  }, 60000);

  it("backfill covers the head window when the head itself fails", async () => {
    const db = memoryDb();
    await seedConnection(db);
    let calls = 0;
    let served = false;
    const headFlaky = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        calls += 1;
        // Head exhausts its retries; the backfill then covers the same window once.
        if (calls <= 3) throw new Error("ISN /json/orders returned a non-JSON response (HTTP 200)");
        if (input.cursor || served) return { items: [] };
        served = true;
        return { items: [order("1", new Date(NOW - 86400000).toISOString())] };
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 2, nowMs: NOW, adapter: headFlaky });
    expect(summary.error).toBeUndefined();
    expect(summary.rowsUpserted).toBe(1);
  }, 60000);

  it("never pulls windows older than the 5-year history", async () => {
    const db = memoryDb();
    await seedConnection(db);
    const seen: Array<{ from: string; to: string }> = [];
    // An endless vendor: every window returns an order, so only the history
    // cap can finish the seed (empty-window finish never triggers).
    const endless = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        seen.push({ from: input.from ?? "", to: input.to ?? "" });
        return { items: [order(`o${seen.length}`, new Date(NOW - 86400000).toISOString())] };
      },
    });
    const cutoff = new Date(NOW);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
    const jan1 = new Date(Date.UTC(cutoff.getUTCFullYear(), 0, 1));
    await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 60, nowMs: NOW, adapter: endless });
    expect(seen.length).toBeGreaterThan(0);
    // Window ends stay past January 1st of the cutoff year; starts may
    // reach it exactly so the starting year syncs in full.
    for (const w of seen) {
      expect(w.to > jan1.toISOString()).toBe(true);
      expect(w.from >= jan1.toISOString()).toBe(true);
    }
    const second = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 60, nowMs: NOW, adapter: endless });
    expect(second.finished).toBe(true);
    expect(second.status).toBe("live");
  }, 120000);

  it("finishes immediately when the cursor already reaches the 5-year cutoff", async () => {
    const db = memoryDb();
    await seedConnection(db);
    // Pre-cap seed parked at 2014: every backfill window is out of scope.
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG,
      provider: "spectora",
      status: "backfilling",
      cursorDate: "2014-06-30T12:00:00.000Z",
      updatedAt: Math.floor(NOW / 1000),
    });
    const seen: Array<{ from: string; to: string }> = [];
    const adapter = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        seen.push({ from: input.from ?? "", to: input.to ?? "" });
        return { items: [order(`o${seen.length}`, new Date(NOW - 86400000).toISOString())] };
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 60, nowMs: NOW, adapter });
    expect(summary.finished).toBe(true);
    expect(summary.status).toBe("live");
    // Only the head window runs; no backfill window is requested twice-ready.
    const cutoff = new Date(NOW);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
    for (const w of seen) expect(w.to >= cutoff.toISOString()).toBe(true);
  }, 120000);

  it("the clamped boundary chunk finishes the seed instead of repeating", async () => {
    const db = memoryDb();
    await seedConnection(db);
    // Cursor parked exactly at the boundary chunk's end: the next backfill
    // window straddles the cutoff and must complete the seed in one run.
    // Without the clamp-finish, this window re-fetches forever with the
    // cursor pinned to the cutoff.
    const boundaryTo = new Date(NOW - 1800 * 86400000).toISOString();
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG,
      provider: "spectora",
      status: "backfilling",
      cursorDate: boundaryTo,
      updatedAt: Math.floor(NOW / 1000),
    });
    const seen: Array<{ from: string; to: string }> = [];
    const adapter = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        seen.push({ from: input.from ?? "", to: input.to ?? "" });
        return { items: [order(`o${seen.length}`, new Date(NOW - 86400000).toISOString())] };
      },
    });
    const first = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 60, nowMs: NOW, adapter });
    expect(first.finished).toBe(true);
    expect(first.status).toBe("live");
    const cutoff = new Date(NOW);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
    const jan1 = new Date(Date.UTC(cutoff.getUTCFullYear(), 0, 1));
    // The boundary fetch starts exactly at January 1st of the cutoff year,
    // never before it, and the cursor parks there.
    expect(first.cursorDate).toBe(jan1.toISOString());
    const backfills = seen.filter((w) => w.to < new Date(NOW - 90 * 86400000).toISOString());
    expect(backfills.length).toBeGreaterThan(0);
    for (const w of backfills) {
      expect(w.from >= jan1.toISOString()).toBe(true);
      expect(w.to > jan1.toISOString()).toBe(true);
    }
    // And the next run does not re-fetch it: history is complete.
    seen.length = 0;
    const second = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 60, nowMs: NOW, adapter });
    expect(second.finished).toBe(true);
    const refetch = seen.filter((w) => w.to < new Date(NOW - 90 * 86400000).toISOString());
    expect(refetch).toEqual([]);
  }, 120000);

  it("marks auth failures terminal so owners check the connection", async () => {
    const db = memoryDb();
    await seedConnection(db);
    let attempts = 0;
    const denied = fakeAdapter({
      async searchOrders() {
        attempts += 1;
        const err = new Error("ISN request failed (401)") as Error & { httpStatus: number };
        err.httpStatus = 401;
        throw err;
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 2, nowMs: NOW, adapter: denied });
    expect(summary.status).toBe("error");
    expect(attempts).toBe(1);
  });

  it("heals buyer and agent names on re-sync via the conflict update", async () => {
    const db = memoryDb();
    await seedConnection(db);
    let names = { buyer: "Buyer A", buying: "Agent A", selling: "Agent S" };
    const renaming = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return { items: [{
          ...order("1", new Date(NOW - 86400000).toISOString()),
          buyerName: names.buyer,
          buyingAgentName: names.buying,
          sellingAgentName: names.selling,
        }] };
      },
    });
    await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: renaming });
    names = { buyer: "Buyer B", buying: "Agent B", selling: "Agent T" };
    await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: renaming });
    const rows = await db.select().from(schema.orgOrders);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ buyerName: "Buyer B", buyingAgentName: "Agent B", sellingAgentName: "Agent T" });
  });

  it("checkpoints progress mid-run so an interrupted seed never reports zero", async () => {    const db = memoryDb();
    await seedConnection(db);
    const one = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return { items: [order("1", new Date(NOW - 86400000).toISOString())] };
      },
    });
    await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: one });
    const state = await db.select().from(schema.orgSyncState);
    expect(state[0]?.totalFetched).toBe(1);
    expect(state[0]?.lastSyncedAt).toBe(Math.floor(NOW / 1000));
    expect(state[0]?.status).toBe("backfilling");
  });

  it("stores the vendor total and seed start for ETA math", async () => {
    const db = memoryDb();
    await seedConnection(db);
    const adapter = fakeAdapter({
      async estimateTotal() {
        return 6456;
      },
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return { items: [order("1", new Date(NOW - 86400000).toISOString())] };
      },
    });
    await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    const state = await db.select().from(schema.orgSyncState);
    expect(state[0]?.totalEstimate).toBe(6456);
    expect(state[0]?.seedStartedAt).toBe(Math.floor(NOW / 1000));
  });

  it("treats a missing estimate as unknown instead of failing", async () => {
    const db = memoryDb();
    await seedConnection(db);
    const adapter = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return { items: [order("1", new Date(NOW - 86400000).toISOString())] };
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(summary.error).toBeUndefined();
    const state = await db.select().from(schema.orgSyncState);
    expect(state[0]?.totalEstimate).toBeNull();
    expect(state[0]?.seedStartedAt).toBe(Math.floor(NOW / 1000));
  });

  it("upserts are idempotent across repeated runs", async () => {    const db = memoryDb();
    await seedConnection(db);
    const ok = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return { items: [order("1", new Date(NOW - 86400000).toISOString())], nextCursor: "2" };
      },
    });
    const firstRun = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: ok });
    expect(firstRun.error).toBeUndefined();
    // Wipe the cursor so the same window syncs again; row count must not grow.
    await db.delete(schema.orgSyncState);
    const second = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: ok });
    expect(second.error).toBeUndefined();
    const rows = await db.select().from(schema.orgOrders);
    expect(rows).toHaveLength(1);
    const services = await db.select().from(schema.orgOrderServices);
    expect(services).toHaveLength(1);
  });

  it("keeps a live workspace live on head-only runs", async () => {
    const db = memoryDb();
    await seedConnection(db);
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG,
      provider: "spectora",
      status: "live",
      cursorDate: "2020-01-01T00:00:00.000Z",
      totalFetched: 100,
      updatedAt: Math.floor(NOW / 1000),
    });
    const quiet = fakeAdapter({});
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: quiet });
    expect(summary.error).toBeUndefined();
    expect(summary.status).toBe("live");
    const state = await db.select().from(schema.orgSyncState);
    expect(state[0]?.status).toBe("live");
  });

    it("syncs the latest window first on already-seeded workspaces", async () => {    const db = memoryDb();
    await seedConnection(db);
    // Pretend a seed finished long ago; only the head window has new work.
    const oldCursor = "2020-01-01T00:00:00.000Z";
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG,
      provider: "spectora",
      status: "live",
      cursorDate: oldCursor,
      totalFetched: 100,
      updatedAt: Math.floor(NOW / 1000),
    });
    const headTo = new Date(NOW).toISOString();
    const fresh = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        // Only the latest window carries a new order; history is quiet.
        if ((input.to ?? "") >= headTo && !input.cursor) {
          return { items: [order("new", new Date(NOW - 86400000).toISOString())] };
        }
        return { items: [] };
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter: fresh });
    expect(summary.error).toBeUndefined();
    expect(summary.rowsUpserted).toBe(1);
    const rows = await db.select().from(schema.orgOrders);
    expect(rows.map((r) => r.providerOrderId)).toEqual(["new"]);
  });

  it("enriches ISN service detail newest-first within the per-run cap", async () => {    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedLiveState(db);
    const isnOrder = (id: string, scheduledAt: string): OrderRecord => ({
      id,
      status: "completed",
      scheduledAt,
      total: 50000,
      currency: "USD",
      inspectorName: "Sam",
      buyingAgentName: "Agent A",
      details: {},
    });
    const adapter = fakeAdapter({
      async searchOrders() {
        return {
          items: [
            isnOrder("old", new Date(NOW - 10 * 86400000).toISOString()),
            isnOrder("mid", new Date(NOW - 5 * 86400000).toISOString()),
            isnOrder("new", new Date(NOW - 86400000).toISOString()),
          ],
        };
      },
      async getOrder(id: string) {
        return {
          id,
          details: { services: [{ uuid: "u", name: `Service ${id}` }] },
        } as unknown as OrderRecord;
      },
    });
    const cappedEnv = { MCP_ENCRYPTION_KEY: KEY, ANALYTICS_ENRICH_PER_RUN: "2" } as unknown as Env;
    const first = await runAnalyticsSyncForOrg(cappedEnv, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(first.error).toBeUndefined();
    expect(first.enriched).toBe(2);
    let services = await db.select().from(schema.orgOrderServices);
    // Newest two orders served (cap), oldest still missing.
    expect(services.map((s) => s.name).sort()).toEqual(["Service mid", "Service new"]);
    const second = await runAnalyticsSyncForOrg(cappedEnv, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(second.enriched).toBe(1);
    services = await db.select().from(schema.orgOrderServices);
    expect(services).toHaveLength(3);
  });

  it("chunks the enrichment existence check past D1's bound-parameter limit", async () => {    // Regression: D1 rejects statements with more than ~100 bound parameters,
    // and a busy head window alone carries hundreds of ids — the whole refresh
    // 500'd and the final state write never happened.
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedLiveState(db);
    const rains = Array.from({ length: 120 }, (_, i) => ({
      id: `o${i}`,
      status: "completed",
      scheduledAt: new Date(NOW - 86400000).toISOString(),
      total: 50000,
      currency: "USD",
      details: {},
    }));
    const adapter = fakeAdapter({
      async searchOrders() {
        return { items: rains };
      },
      async getOrder(id: string) {
        return { id, details: { services: [{ uuid: "u", name: "General Home Inspection" }] } } as unknown as OrderRecord;
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(summary.error).toBeUndefined();
    expect(summary.enriched).toBe(120);
    const services = await db.select().from(schema.orgOrderServices);
    expect(services).toHaveLength(120);
    const state = await db.select().from(schema.orgSyncState);
    expect(state[0]?.status).toBe("live");
  });

  it("enriches the oldest bare rows so coverage climbs after going live", async () => {
    // Live workspaces only re-touch the head window; without the tail query
    // below, ancient rows would stay bare forever and coverage would freeze.
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedLiveState(db);
    await db.insert(schema.orgOrders).values([
      { id: `${ORG}:isn:old`, organizationId: ORG, provider: "isn", providerOrderId: "old", status: "completed", scheduledAt: "2020-01-01T10:00:00Z", syncedAt: 1 },
      { id: `${ORG}:isn:new`, organizationId: ORG, provider: "isn", providerOrderId: "new", status: "completed", scheduledAt: new Date(NOW - 86400000).toISOString(), syncedAt: 1 },
    ]);
    await db.insert(schema.orgOrderServices).values({
      id: `${ORG}:isn:new:svc:0`, organizationId: ORG, orderId: `${ORG}:isn:new`, name: "General Home Inspection", kind: "base",
    });
    const adapter = fakeAdapter({
      async searchOrders() {
        return { items: [] };
      },
      async getOrder(id: string) {
        return { id, details: { services: [{ uuid: "u", name: `Service ${id}` }] } } as unknown as OrderRecord;
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(summary.error).toBeUndefined();
    expect(summary.enriched).toBe(1);
    const services = await db.select().from(schema.orgOrderServices);
    expect(services.map((s) => s.name).sort()).toEqual(["General Home Inspection", "Service old"]);
  });

  it("records enrichment blackouts instead of stalling silently at zero", async () => {
    // A run whose detail reads all fail used to report enriched: 0 with no
    // error — indistinguishable from "nothing to do" while coverage froze.
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedLiveState(db);
    const bare: OrderRecord = {
      id: "1",
      status: "completed",
      scheduledAt: new Date(NOW - 86400000).toISOString(),
      details: {},
    };
    const adapter = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return { items: [bare] };
      },
      async getOrder() {
        throw new Error("ISN request failed (HTTP 429)");
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(summary.enriched).toBe(0);
    expect(summary.enrichFailed).toBe(1);
    expect(summary.error).toContain("service detail unavailable");
    // A live workspace stays live through an enrichment blackout: the error
    // is recorded, but enrichment hiccups must not park it as backfilling.
    expect(summary.status).toBe("live");
    // The run still lands: progress persists for the next retry.
    const state = await db.select().from(schema.orgSyncState);
    expect(state).toHaveLength(1);
    expect(state[0]?.totalFetched).toBe(1);
  });

  it("skips enrichment while the backfill is unfinished (strict phases)", async () => {    // Backfilling runs fetch listing windows only; detail reads start once
    // the seed is complete so the two phases never compete for budget.
    const db = memoryDb();
    await seedConnection(db, "isn");
    const adapter = fakeAdapter({
      async searchOrders(input) {
        if (input.status === "cancelled") return { items: [] };
        if (input.cursor) return { items: [] };
        return {
          items: [{
            id: "1", status: "completed",
            scheduledAt: new Date(NOW - 86400000).toISOString(),
            total: 50000, currency: "USD", details: {},
          } as OrderRecord],
        };
      },
      async getOrder(id: string) {
        return { id, details: { services: [{ uuid: "u", name: "General Home Inspection" }] } } as unknown as OrderRecord;
      },
    });
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1, nowMs: NOW, adapter });
    expect(summary.error).toBeUndefined();
    expect(summary.status).toBe("backfilling");
    expect(summary.enriched).toBe(0);
    expect(summary.enrichFailed).toBe(0);
    const services = await db.select().from(schema.orgOrderServices);
    expect(services).toHaveLength(0);
  });

  it("reports an enrichment backlog only for bare non-cancelled orders", async () => {
    // The per-minute tick gates live workspaces on this: hourly throttle
    // stands only when enrichment is complete.
    const db = memoryDb();
    await seedConnection(db, "isn");
    expect(await hasEnrichmentBacklog(db, ORG)).toBe(false);
    await db.insert(schema.orgOrders).values([
      { id: `${ORG}:isn:bare`, organizationId: ORG, provider: "isn", providerOrderId: "bare", status: "completed", scheduledAt: "2026-01-01T10:00:00Z", syncedAt: 1 },
      { id: `${ORG}:isn:done`, organizationId: ORG, provider: "isn", providerOrderId: "done", status: "completed", scheduledAt: "2026-01-01T10:00:00Z", syncedAt: 1 },
      { id: `${ORG}:isn:gone`, organizationId: ORG, provider: "isn", providerOrderId: "gone", status: "cancelled", scheduledAt: "2026-01-01T10:00:00Z", syncedAt: 1 },
    ]);
    await db.insert(schema.orgOrderServices).values({
      id: `${ORG}:isn:done:svc:0`, organizationId: ORG, orderId: `${ORG}:isn:done`, name: "General Home Inspection", kind: "base",
    });
    expect(await hasEnrichmentBacklog(db, ORG)).toBe(true);
    await db.insert(schema.orgOrderServices).values({
      id: `${ORG}:isn:bare:svc:0`, organizationId: ORG, orderId: `${ORG}:isn:bare`, name: "General Home Inspection", kind: "base",
    });
    // Only the cancelled bare row remains: no backlog.
    expect(await hasEnrichmentBacklog(db, ORG)).toBe(false);
  });

  it("leases sync runs so overlapping ticks skip busy orgs", async () => {
    const db = memoryDb();
    // First claim wins; a second tick inside the window stands down.
    expect(await claimRunLease(db, ORG, NOW)).toBe(true);
    expect(await claimRunLease(db, ORG, NOW + 60_000)).toBe(false);
    // Other orgs are unaffected.
    expect(await claimRunLease(db, "o2", NOW + 60_000)).toBe(true);
    // A stale lease (crashed run) expires by time.
    expect(await claimRunLease(db, ORG, NOW + 120_001)).toBe(true);
    // Release clears the lease: the next tick runs immediately instead of
    // waiting out the window.
    await releaseRunLease(db, ORG);
    expect(await claimRunLease(db, ORG, NOW + 120_002)).toBe(true);
    // Releasing what was never claimed is a no-op, never an error.
    await releaseRunLease(db, "o3");
    expect(await claimRunLease(db, "o3", NOW)).toBe(true);
  });
});