import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env, SyncWorkflowBinding } from "../src/server/lib/env";
import type { BusinessProviderAdapter, OrderRecord } from "../src/server/providers/types";
import { encryptJson } from "../src/server/lib/crypto";
import {
  ENRICH_CLAIM_CAP,
  ENRICH_PARENT_STALE_MS,
  TerminalSyncError,
  buildOrgAdapter,
  enrichLeafId,
  enrichParentId,
  enrichRunTag,
  ensureEnrichmentParent,
  ensureListingLink,
  getOrCreateInstance,
  isBusyError,
  isQuotaError,
  jitterMs,
  listingLinkId,
  msUntilUtcMidnight,
  partitionIds,
  runEnrichParentCycle,
  runListingLinkBody,
  runWorkflowSupervisor,
  workflowChildConcurrency,
  workflowChunkSize,
  workflowFanout,
  workflowPaceSeconds,
} from "../src/server/analytics/sync-tasks";
import { fetchEnrichBatch, writeEnrichBatch } from "../src/server/analytics/sync";

const KEY = "test-workflow-key-must-be-long-enough-12";
const ORG = "o1";
const NOW = new Date("2026-10-23T12:00:00.000Z").getTime();
const ENV = { MCP_ENCRYPTION_KEY: KEY } as unknown as Env;

function memoryDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE sidekick_connections (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider TEXT NOT NULL,
      encrypted_credentials TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'connected',
      capabilities_json TEXT, external_account_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
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
      provider_updated_at TEXT, synced_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX org_orders_org_provider_order_idx ON org_orders (organization_id, provider, provider_order_id);
    CREATE TABLE org_order_services (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, order_id TEXT NOT NULL,
      name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'base', amount_minor INTEGER
    );
    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, level TEXT NOT NULL,
      event TEXT NOT NULL, surface TEXT NOT NULL, message TEXT NOT NULL,
      path TEXT, method TEXT, status_code INTEGER, user_id TEXT, user_email TEXT,
      org_id TEXT, org_name TEXT, ip TEXT, user_agent TEXT, request_id TEXT,
      detail_json TEXT, city TEXT, country TEXT
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

async function seedConnection(db: Db, provider: "spectora" | "isn" = "isn") {
  const blob = await encryptJson(KEY, provider === "isn" ? { companyKey: "c", host: "test.inspectionsupport.com", accessKey: "a", secretKey: "s" } : { apiKey: "test-key" });
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

function fakeAdapter(impl: Partial<BusinessProviderAdapter> = {}): BusinessProviderAdapter {
  return {
    key: "isn",
    capabilities: async () => ({ provider: "isn", read: [], write: [] }),
    searchClients: async () => ({ items: [] }),
    getClient: async () => null,
    searchOrders: async () => ({ items: [] }),
    getOrder: async () => null,
    searchAgents: async () => null,
    getAgent: async () => null,
    searchEvents: async () => ({ items: [] }),
    ...impl,
  } as unknown as BusinessProviderAdapter;
}

function fakeBinding(opts: {
  existing?: Record<string, string>;
  throwStatus?: string[];
  failCreateOnce?: boolean;
} = {}): SyncWorkflowBinding & { created: string[]; deleted: string[]; batches: number } {
  const instances = new Map<string, string>(Object.entries(opts.existing ?? {}));
  const throwSet = new Set(opts.throwStatus ?? []);
  const created: string[] = [];
  const deleted: string[] = [];
  let batches = 0;
  const failOnce = { value: opts.failCreateOnce ?? false };
  const handle = (id: string) => ({
    id,
    async status() {
      if (throwSet.has(id)) throw new Error("status unreadable");
      return { status: instances.get(id) ?? "unknown" };
    },
    async delete() {
      deleted.push(id);
      instances.delete(id);
    },
  });
  return {
    created,
    deleted,
    get batches() {
      return batches;
    },
    async get(id: string) {
      if (!instances.has(id)) throw new Error(`not found: ${id}`);
      return handle(id);
    },
    async create(options: { id?: string; params?: unknown }) {
      if (failOnce.value) {
        failOnce.value = false;
        // Model a true lost race: someone else created it first.
        instances.set(options.id!, "running");
        throw new Error("creation race lost");
      }
      if (!options.id || instances.has(options.id)) throw new Error(`exists: ${options.id}`);
      instances.set(options.id, "running");
      created.push(options.id);
      return handle(options.id);
    },
    async createBatch(batch: Array<{ id?: string; params?: unknown }>) {
      batches += 1;
      const out = [];
      for (const b of batch) {
        if (!b.id || instances.has(b.id)) throw new Error(`exists: ${b.id}`);
        instances.set(b.id, "running");
        created.push(b.id);
        out.push(handle(b.id));
      }
      return out;
    },
  } as unknown as SyncWorkflowBinding & { created: string[]; deleted: string[]; batches: number };
}

describe("workflow knobs", () => {
  it("default to free-tier-safe values and clamp", () => {
    expect(workflowChunkSize(undefined)).toBe(45);
    expect(workflowChunkSize({ SYNC_WORKFLOW_CHUNK: "500" })).toBe(45);
    expect(workflowChunkSize({ SYNC_WORKFLOW_CHUNK: "0" })).toBe(1);
    expect(workflowFanout(undefined)).toBe(50);
    expect(workflowFanout({ SYNC_WORKFLOW_FANOUT: "0" })).toBe(1);
    expect(workflowFanout({ SYNC_WORKFLOW_FANOUT: "500" })).toBe(50);
    expect(workflowChildConcurrency(undefined)).toBe(4);
    expect(workflowChildConcurrency({ SYNC_WORKFLOW_CHILD_CONCURRENCY: "99" })).toBe(8);
    expect(workflowPaceSeconds(undefined)).toBe(15);
    expect(workflowPaceSeconds({ SYNC_WORKFLOW_PACE_SECONDS: "-5" })).toBe(0);
    expect(ENRICH_CLAIM_CAP).toBe(2000);
    expect(ENRICH_PARENT_STALE_MS).toBe(600000);
    expect(jitterMs(0)).toBe(0);
    expect(jitterMs(13)).toBe(9000);
  });

  it("partitions preserving order with a bounded tail", () => {
    const ids = Array.from({ length: 105 }, (_, i) => `p${i}`);
    const parts = partitionIds(ids, 45);
    expect(parts.map((p) => p.length)).toEqual([45, 45, 15]);
    expect(parts.flat()).toEqual(ids);
    expect(partitionIds([], 45)).toEqual([]);
  });
});

describe("workflow ids", () => {
  it("are deterministic, id-safe, and bounded", () => {
    const ids = [
      enrichParentId(ORG, NOW),
      enrichLeafId(ORG, enrichRunTag(NOW), 0, 3),
      listingLinkId(ORG, 12),
    ];
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(id.length).toBeLessThanOrEqual(100);
    }
    expect(enrichLeafId(ORG, "tag-a", 0, 3)).toBe(enrichLeafId(ORG, "tag-a", 0, 3));
    expect(enrichLeafId(ORG, "tag-a", 0, 3)).not.toBe(enrichLeafId(ORG, "tag-b", 0, 3));
    expect(enrichParentId(ORG, NOW)).not.toBe(enrichParentId(ORG, NOW + 86400000));
  });
});

describe("error classifiers and timing", () => {
  it("detects quota and busy errors", () => {
    expect(isQuotaError(new Error("Your account has exceeded D1's free tier daily row write limit."))).toBe(true);
    expect(isQuotaError(new Error("boom"))).toBe(false);
    expect(isBusyError(new Error("database is locked"))).toBe(true);
    expect(isBusyError(new Error("SQLITE_BUSY"))).toBe(true);
    expect(isBusyError(new Error("boom"))).toBe(false);
    expect(new TerminalSyncError("x")).toBeInstanceOf(Error);
  });

  it("computes ms until 00:05 UTC", () => {
    // Noon UTC -> 12h05m.
    expect(msUntilUtcMidnight(Date.parse("2026-10-23T12:00:00Z"))).toBe((12 * 60 + 5) * 60000);
  });
});

describe("getOrCreateInstance", () => {
  it("reuses live instances without creating", async () => {
    const binding = fakeBinding({ existing: { "w-1": "running" } });
    expect(await getOrCreateInstance(binding, "w-1", {})).toEqual({ id: "w-1", reused: true });
    expect(binding.created).toEqual([]);
  });

  it("creates when missing", async () => {
    const binding = fakeBinding();
    expect(await getOrCreateInstance(binding, "w-2", { a: 1 })).toEqual({ id: "w-2", reused: false });
    expect(binding.created).toEqual(["w-2"]);
  });

  it("deletes terminal instances then recreates", async () => {
    const binding = fakeBinding({ existing: { "w-3": "errored" } });
    expect(await getOrCreateInstance(binding, "w-3", {})).toEqual({ id: "w-3", reused: false });
    expect(binding.deleted).toEqual(["w-3"]);
    expect(binding.created).toEqual(["w-3"]);
  });

  it("survives a lost creation race by re-reading", async () => {
    const binding = fakeBinding({ failCreateOnce: true });
    expect(await getOrCreateInstance(binding, "w-4", {})).toEqual({ id: "w-4", reused: true });
  });

  it("replaces (never parks on) an instance with unreadable status", async () => {
    const binding = fakeBinding({ existing: { "w-5": "errored" }, throwStatus: ["w-5"] });
    expect(await getOrCreateInstance(binding, "w-5", {})).toEqual({ id: "w-5", reused: false });
    expect(binding.deleted).toEqual(["w-5"]);
    expect(binding.created).toEqual(["w-5"]);
  });
});

describe("buildOrgAdapter", () => {
  it("returns null without a connection and throws without a key", async () => {
    const db = memoryDb();
    expect(await buildOrgAdapter(ENV, db, ORG)).toBeNull();
    await seedConnection(db, "isn");
    await expect(buildOrgAdapter({} as Env, db, ORG)).rejects.toBeInstanceOf(TerminalSyncError);
    const org = await buildOrgAdapter(ENV, db, ORG);
    expect(org?.provider).toBe("isn");
    expect(typeof org?.adapter.getOrder).toBe("function");
  });
});

describe("enrich parent tasks", () => {
  async function seedMissing(db: Db, n: number) {
    for (let i = 0; i < n; i += 1) {
      await db.insert(schema.orgOrders).values({
        id: `o1:isn:${i}`,
        organizationId: ORG,
        provider: "isn",
        providerOrderId: String(i),
        status: "completed",
        scheduledAt: "2026-03-01T10:00:00Z",
        syncedAt: 1,
      });
    }
  }

  it("claims newest-first and fans out one leaf per chunk", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 100);
    const binding = fakeBinding();
    const wave = await runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 50, enrichRunTag(NOW), 0);
    expect(wave.claimed).toBe(100);
    expect(wave.leaves).toHaveLength(3);
    expect(wave.done).toBe(false);
    expect(binding.batches).toBe(1);
  });

  it("slices waves to the fanout cap", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 200);
    const binding = fakeBinding();
    const wave = await runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 2, enrichRunTag(NOW), 0);
    expect(wave.claimed).toBe(200);
    expect(wave.leaves).toHaveLength(2);
  });

  it("uses disjoint leaf ids across cycles of one parent run", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 100);
    const binding = fakeBinding();
    const first = await runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 50, "tag-a", 0);
    const second = await runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 50, "tag-a", 1);
    expect(first.leaves).toHaveLength(3);
    expect(second.leaves).toHaveLength(3);
    expect(new Set([...first.leaves, ...second.leaves]).size).toBe(6);
  });

  it("collides loudly on same-tag same-cycle reuse (the parked-parent bug)", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 100);
    const binding = fakeBinding();
    await runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 50, "tag-a", 0);
    await expect(runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 50, "tag-a", 0)).rejects.toThrow();
  });

  it("returns done on empty backlog and skips non-ISN providers", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    const binding = fakeBinding();
    expect(await runEnrichParentCycle(binding, db, ORG, "isn", 45, 2000, 50, "tag-a", 0)).toMatchObject({ claimed: 0, done: true });
    expect(binding.created).toEqual([]);
    expect(await runEnrichParentCycle(binding, db, ORG, "spectora", 45, 2000, 50, "tag-a", 0)).toMatchObject({ done: true });
  });
});

describe("enrich leaf tasks", () => {
  it("fetches the claimed ids with bounded parallelism", async () => {
    const gets: string[] = [];
    const adapter = fakeAdapter({
      getOrder: async (id: string) => {
        gets.push(id);
        return { id, details: { services: [{ uuid: "u", name: `Service ${id}` }] } } as unknown as OrderRecord;
      },
    });
    const out = await fetchEnrichBatch(adapter, ORG, ["a", "b", "c"], 2);
    expect(out.results).toHaveLength(3);
    expect(out.failed).toBe(0);
    expect(out.results).toHaveLength(3);
    expect(new Set(gets).size).toBe(3);
  });

  it("counts failures without blocking the batch", async () => {
    const adapter = fakeAdapter({
      getOrder: async (id: string) => {
        if (id === "bad") throw new Error("ISN request failed (HTTP 429)");
        return { id, details: { services: [{ uuid: "u", name: `Service ${id}` }] } } as unknown as OrderRecord;
      },
    });
    const out = await fetchEnrichBatch(adapter, ORG, ["a", "bad"], 4);
    expect(out.results).toHaveLength(1);
    expect(out.failed).toBe(1);
    expect(out.firstError).toContain("429");
    expect(out.results.map((r) => r.orderId)).toEqual(["o1:isn:a"]);
  });

  it("writes idempotently with amounts and markers", async () => {
    const db = memoryDb();
    const batch = [
      { orderId: "o1:isn:a", items: [{ name: "General Home Inspection", kind: "base", amountMinor: 38900 }] },
      { orderId: "o1:isn:b", items: [] },
    ];
    expect(await writeEnrichBatch(db, ORG, batch)).toEqual({ done: 2 });
    let rows = await db.select().from(schema.orgOrderServices);
    expect(rows).toHaveLength(2);
    const marker = rows.find((r) => r.orderId === "o1:isn:b");
    expect(marker).toMatchObject({ name: "__no_charge__", amountMinor: 0 });
    const charged = rows.find((r) => r.orderId === "o1:isn:a");
    expect(charged).toMatchObject({ name: "General Home Inspection", amountMinor: 38900 });
    // Repeat: delete+insert converges, never duplicates.
    expect(await writeEnrichBatch(db, ORG, batch)).toEqual({ done: 2 });
    rows = await db.select().from(schema.orgOrderServices);
    expect(rows).toHaveLength(2);
  });
});

describe("listing ensure", () => {
  it("creates link-0 for fresh orgs and reuses live links", async () => {
    const db = memoryDb();
    const binding = fakeBinding();
    const first = await ensureListingLink(binding, db, ORG, NOW);
    expect(first).toMatchObject({ id: "lst-o1-0", reused: false });
    expect(await ensureListingLink(binding, db, ORG, NOW)).toMatchObject({ id: "lst-o1-0", reused: true });
    expect(binding.created).toEqual(["lst-o1-0"]);
  });

  it("returns null once the walk is finished", async () => {
    const db = memoryDb();
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG, provider: "isn", status: "live", cursorDate: "2020-01-01T00:00:00.000Z", updatedAt: 1,
    });
    const binding = fakeBinding();
    expect(await ensureListingLink(binding, db, ORG, NOW)).toBeNull();
    expect(binding.created).toEqual([]);
  });

  it("derives the next index from a mid-walk cursor", async () => {
    const db = memoryDb();
    const cursor = new Date(NOW - 3 * 90 * 86400000).toISOString();
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG, provider: "isn", status: "backfilling", cursorDate: cursor, updatedAt: 1,
    });
    const binding = fakeBinding();
    expect(await ensureListingLink(binding, db, ORG, NOW)).toMatchObject({ id: "lst-o1-3", reused: false });
  });
});

describe("enrichment parent ensure", () => {
  async function seedMissing(db: Db, n: number) {
    for (let i = 0; i < n; i += 1) {
      await db.insert(schema.orgOrders).values({
        id: `o1:isn:${i}`,
        organizationId: ORG,
        provider: "isn",
        providerOrderId: String(i),
        status: "completed",
        scheduledAt: "2026-03-01T10:00:00Z",
        syncedAt: 1,
      });
    }
  }

  async function beat(db: Db, ageMs: number, event = "sync.parent_cycle") {
    await db.insert(schema.appLogs).values({
      id: `beat-${ageMs}-${event}`, createdAt: NOW - ageMs, level: "info",
      event, surface: "cron", message: "beat", orgId: ORG,
    });
  }

  it("returns null without backlog, provider, or binding", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    const binding = fakeBinding();
    expect(await ensureEnrichmentParent(binding, db, ORG, "isn", NOW)).toBeNull();
    expect(await ensureEnrichmentParent(undefined, db, ORG, "isn", NOW)).toBeNull();
    expect(await ensureEnrichmentParent(binding, db, ORG, "spectora", NOW)).toBeNull();
    await seedMissing(db, 1);
    expect(await ensureEnrichmentParent(binding, db, ORG, "spectora", NOW)).toBeNull();
  });

  it("creates dated parents once and reuses live ones with fresh beats", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 2);
    const binding = fakeBinding();
    const first = await ensureEnrichmentParent(binding, db, ORG, "isn", NOW);
    expect(first?.reused).toBe(false);
    await beat(db, 60_000);
    expect(await ensureEnrichmentParent(binding, db, ORG, "isn", NOW)).toMatchObject({ reused: true });
    expect(binding.created).toHaveLength(1);
  });

  it("reaps a live parent with a stale heartbeat", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 2);
    await beat(db, 20 * 60_000);
    const binding = fakeBinding({ existing: { [enrichParentId(ORG, NOW)]: "running" } });
    const out = await ensureEnrichmentParent(binding, db, ORG, "isn", NOW);
    expect(out).toMatchObject({ reused: false });
    expect(binding.deleted).toEqual([enrichParentId(ORG, NOW)]);
  });

  it("reaps a live parent with no heartbeat at all (zombie)", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await seedMissing(db, 2);
    const binding = fakeBinding({ existing: { [enrichParentId(ORG, NOW)]: "running" } });
    const out = await ensureEnrichmentParent(binding, db, ORG, "isn", NOW);
    expect(out).toMatchObject({ reused: false });
    expect(binding.deleted).toEqual([enrichParentId(ORG, NOW)]);
  });
});

describe("listing link body", () => {
  it("runs one window without head or enrichment", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    const adapter = fakeAdapter({
      async searchOrders() {
        return {
          items: [{
            id: "9", status: "completed", scheduledAt: new Date(NOW - 86400000).toISOString(),
            total: 10000, currency: "USD",
          } as OrderRecord],
        };
      },
    });
    const out = await runListingLinkBody(ENV, db, ORG, NOW, adapter);
    expect(out.finished).toBe(false);
    const rows = await db.select().from(schema.orgOrders);
    expect(rows).toHaveLength(1);
  });

  it("finishes without a connection", async () => {
    const db = memoryDb();
    expect(await runListingLinkBody(ENV, db, ORG, NOW)).toMatchObject({ finished: true });
  });
});

describe("workflow supervisor", () => {
  async function liveState(db: Db, lastSyncedAt: number) {
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG, provider: "isn", status: "live",
      cursorDate: "2020-01-01T00:00:00.000Z", lastSyncedAt, updatedAt: 1,
    });
  }

  it("ensures listing links for backfilling orgs without running anything", async () => {
    const db = memoryDb();
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG, provider: "isn", status: "backfilling", updatedAt: 1,
    });
    const binding = fakeBinding();
    const heads: string[] = [];
    const out = await runWorkflowSupervisor(binding, ENV, db, NOW, async (orgId) => {
      heads.push(orgId);
    });
    expect(out.links).toBe(1);
    expect(out.heads).toBe(0);
    expect(heads).toEqual([]);
    expect(binding.created).toEqual(["lst-o1-0"]);
  });

  it("leaves error states parked", async () => {
    const db = memoryDb();
    await db.insert(schema.orgSyncState).values({
      organizationId: ORG, provider: "isn", status: "error", updatedAt: 1,
    });
    const binding = fakeBinding();
    const out = await runWorkflowSupervisor(binding, ENV, db, NOW, async () => {
      throw new Error("must not run");
    });
    expect(out).toEqual({ links: 0, parents: 0, heads: 0 });
    expect(binding.created).toEqual([]);
  });

  it("creates parents and runs heads for live draining orgs", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await db.insert(schema.orgOrders).values({
      id: "o1:isn:1", organizationId: ORG, provider: "isn", providerOrderId: "1",
      status: "completed", scheduledAt: "2026-03-01T10:00:00Z", syncedAt: 1,
    });
    await liveState(db, 1);
    const binding = fakeBinding();
    const heads: string[] = [];
    const out = await runWorkflowSupervisor(binding, ENV, db, NOW, async (orgId) => {
      heads.push(orgId);
    });
    expect(out.parents).toBe(1);
    expect(out.heads).toBe(1);
    expect(heads).toEqual([ORG]);
    expect(binding.created).toEqual([enrichParentId(ORG, NOW)]);
  });

  it("stays quiet for live drained orgs", async () => {
    const db = memoryDb();
    await seedConnection(db, "isn");
    await liveState(db, Math.floor(NOW / 1000));
    const binding = fakeBinding();
    const out = await runWorkflowSupervisor(binding, ENV, db, NOW, async () => {
      throw new Error("must not run");
    });
    expect(out).toEqual({ links: 0, parents: 0, heads: 0 });
    expect(binding.created).toEqual([]);
  });
});
