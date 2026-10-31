import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";
import type { Auth } from "../src/server/auth";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import { createAnalyticsRoutes } from "../src/server/routes/analytics";
import { toAgentKey, extractAgentContact } from "../src/server/analytics/sync";
import {
  agentLeaderboard,
  inspectorPerformance,
  rangeTotals,
  type StoredOrder,
} from "../src/server/analytics/metrics";
import {
  decodeCursor,
  encodeCursor,
  getAgentLeaderboard,
  getInspectorStats,
  getMonthlyTotals,
  getRangeTotals,
  listOrdersKeyset,
} from "../src/server/analytics/queries";

const MIG_0035 = readFileSync(new URL("../db/migrations/0035_org_orders_perf_idx.sql", import.meta.url), "utf8");
const MIG_0036 = readFileSync(new URL("../db/migrations/0036_org_order_inspectors.sql", import.meta.url), "utf8");
const MIG_0037 = readFileSync(new URL("../db/migrations/0037_org_order_inspectors_backfill.sql", import.meta.url), "utf8");
const MIG_0039 = readFileSync(new URL("../db/migrations/0039_drop_redundant_warehouse.sql", import.meta.url), "utf8");
const MIG_0040 = readFileSync(new URL("../db/migrations/0040_sync_coverage_counters.sql", import.meta.url), "utf8");

const BASE_DDL = `
  CREATE TABLE org_orders (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider TEXT NOT NULL,
    provider_order_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
    scheduled_at TEXT, completed_at TEXT, total_minor INTEGER,
    currency TEXT NOT NULL DEFAULT 'USD', inspector_names TEXT NOT NULL DEFAULT '[]',
    buyer_name TEXT, buyer_email TEXT, buyer_phone TEXT,
    buying_agent_name TEXT, buying_agent_email TEXT, buying_agent_phone TEXT,
    selling_agent_name TEXT, service_type TEXT, referral_source TEXT, address TEXT,
    provider_updated_at TEXT, synced_at INTEGER NOT NULL, raw_json TEXT
  );
  CREATE UNIQUE INDEX org_orders_org_provider_order_idx ON org_orders (organization_id, provider, provider_order_id);
  CREATE TABLE org_order_services (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, order_id TEXT NOT NULL,
    name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'base', amount_minor INTEGER
  );
  CREATE TABLE org_agents (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT, email TEXT, phone TEXT,
    first_seen_at TEXT, last_seen_at TEXT, order_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX org_agents_org_idx ON org_agents (organization_id);
  CREATE INDEX org_agents_org_email_idx ON org_agents (organization_id, email);
  CREATE INDEX org_agents_org_phone_idx ON org_agents (organization_id, phone);
`;

function memoryDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(BASE_DDL);
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      const statement = sqlite.prepare(sql);
      const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
      return { rows: objectRows.map((row) => Object.values(row)) };
    },
    { schema },
  ) as unknown as Db;
  return { db, sqlite };
}

function indexNames(sqlite: DatabaseSync): string[] {
  const rows = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe("migrations 0035/0036", () => {
  it("apply on a 0031-shaped warehouse and create the composite indexes", () => {
    const { sqlite } = memoryDb();
    sqlite.exec(MIG_0035);
    sqlite.exec(MIG_0036);
    const names = indexNames(sqlite);
    for (const want of [
      "org_orders_org_sched_id_idx",
      "org_orders_org_status_sched_idx",
      "org_orders_org_agent_sched_idx",
      "org_order_services_org_name_idx",
      "org_order_inspectors_org_insp_idx",
      "org_order_inspectors_org_order_idx",
    ]) {
      expect(names).toContain(want);
    }
    // Dead agent-directory indexes are trimmed; the table itself stays.
    expect(names).not.toContain("org_agents_org_email_idx");
    expect(names).not.toContain("org_agents_org_phone_idx");
    const tables = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables).toContain("org_order_inspectors");
    expect(tables).toContain("org_agents");
  });

  it("0039 drops redundant indexes and the write-only agents table", () => {
    const { sqlite } = memoryDb();
    sqlite.exec(MIG_0035);
    sqlite.exec(MIG_0036);
    sqlite.exec(MIG_0039);
    const names = indexNames(sqlite);
    // Superseded / redundant indexes are gone; covering composites stay.
    expect(names).not.toContain("org_orders_org_status_idx");
    expect(names).not.toContain("org_orders_org_scheduled_idx");
    expect(names).not.toContain("org_order_inspectors_org_order_idx");
    for (const want of [
      "org_orders_org_provider_order_idx",
      "org_orders_org_sched_id_idx",
      "org_orders_org_status_sched_idx",
      "org_orders_org_agent_sched_idx",
      "org_order_services_org_name_idx",
      "org_order_inspectors_org_insp_idx",
    ]) {
      expect(names).toContain(want);
    }
    const tables = (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((r) => r.name);
    expect(tables).not.toContain("org_agents");
    // Re-runnable: every statement is IF EXISTS guarded.
    expect(() => sqlite.exec(MIG_0039)).not.toThrow();
    for (const line of MIG_0039.split("\n")) {
      const t = line.trim().toUpperCase();
      if (t.startsWith("DROP INDEX") || t.startsWith("DROP TABLE")) {
        expect(t).toMatch(/IF EXISTS/);
      }
    }
  });

  it("0040 adds coverage counters and backfills them from the warehouse", () => {
    const { sqlite } = memoryDb();
    sqlite.exec(`
      CREATE TABLE org_sync_state (
        organization_id TEXT PRIMARY KEY, provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backfilling', cursor_date TEXT,
        last_synced_at INTEGER, total_fetched INTEGER NOT NULL DEFAULT 0,
        error_text TEXT, updated_at INTEGER NOT NULL,
        seed_started_at INTEGER, total_estimate INTEGER
      );
      INSERT INTO org_sync_state (organization_id, provider, status, updated_at) VALUES
        ('o1', 'isn', 'live', 1),
        ('o2', 'isn', 'live', 1);
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, synced_at) VALUES
        ('o1:isn:1', 'o1', 'isn', '1', 'completed', '2026-01-01T10:00:00Z', 1),
        ('o1:isn:2', 'o1', 'isn', '2', 'completed', '2026-01-02T10:00:00Z', 1),
        ('o1:isn:3', 'o1', 'isn', '3', 'cancelled', '2026-01-03T10:00:00Z', 1);
      INSERT INTO org_order_services (id, organization_id, order_id, name, kind) VALUES
        ('o1:isn:1:svc:0', 'o1', 'o1:isn:1', 'General Home Inspection', 'base'),
        ('xeno', 'o2', 'o1:isn:1', 'Sneaky Service', 'base');
    `);
    sqlite.exec(MIG_0040);
    const cols = (sqlite.prepare(`PRAGMA table_info(org_sync_state)`).all() as Array<{ name: string }>).map((r) => r.name);
    expect(cols).toContain("orders_total");
    expect(cols).toContain("orders_with_services");
    const rows = sqlite.prepare(`SELECT organization_id AS org, orders_total AS total, orders_with_services AS covered FROM org_sync_state ORDER BY org`).all() as Array<{ org: string; total: number; covered: number }>;
    // Cancelled excluded, cross-org service rows never leak in: 2 in scope, 1 covered. Empty org stays zero.
    expect(rows).toEqual([
      { org: "o1", total: 2, covered: 1 },
      { org: "o2", total: 0, covered: 0 },
    ]);
  });

  it("is re-runnable for indexes and junction (column add is single-apply, like all repo migrations)", () => {
    const { sqlite } = memoryDb();
    sqlite.exec(MIG_0035);
    sqlite.exec(MIG_0036);
    // 0036 is fully idempotent; 0035's index drops/creates are IF EXISTS guarded.
    expect(() => sqlite.exec(MIG_0036)).not.toThrow();
    for (const line of MIG_0035.split("\n")) {
      const t = line.trim().toUpperCase();
      if (t.startsWith("CREATE INDEX") || t.startsWith("CREATE UNIQUE INDEX") || t.startsWith("DROP INDEX")) {
        expect(t).toMatch(/IF (NOT )?EXISTS/);
      }
    }
  });

  it("backfills agent_key for existing rows", () => {
    const { sqlite } = memoryDb();
    sqlite.exec(`
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, buying_agent_name, buying_agent_email, synced_at)
      VALUES ('o1:spectora:1', 'o1', 'spectora', '1', 'completed', '2026-03-01T10:00:00Z', 'Agent A', 'A@Example.com', 1);
    `);
    sqlite.exec(MIG_0035);
    const row = sqlite.prepare(`SELECT agent_key FROM org_orders WHERE id = 'o1:spectora:1'`).get() as { agent_key: string };
    expect(row.agent_key).toBe("e:a@example.com");
  });

  it("0037 backfills the junction from stored inspector_names JSON, idempotently", () => {
    const { sqlite } = memoryDb();
    sqlite.exec(MIG_0035);
    sqlite.exec(MIG_0036);
    sqlite.exec(`
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, inspector_names, synced_at) VALUES
        ('o1:spectora:1', 'o1', 'spectora', '1', 'completed', '2026-03-01T10:00:00Z', '["Sam", "Jo"]', 1),
        ('o1:spectora:2', 'o1', 'spectora', '2', 'completed', '2026-03-02T10:00:00Z', '[]', 1),
        ('o1:spectora:3', 'o1', 'spectora', '3', 'completed', '2026-03-03T10:00:00Z', '["Sam"]', 1);
    `);
    sqlite.exec(MIG_0037);
    sqlite.exec(MIG_0037);
    const rows = sqlite.prepare(`SELECT order_id, inspector_name FROM org_order_inspectors ORDER BY order_id, inspector_name`).all() as Array<{ order_id: string; inspector_name: string }>;
    expect(rows).toEqual([
      { order_id: "o1:spectora:1", inspector_name: "Jo" },
      { order_id: "o1:spectora:1", inspector_name: "Sam" },
      { order_id: "o1:spectora:3", inspector_name: "Sam" },
    ]);
  });
});

describe("agent_key rule", () => {
  it("matches the leaderboard identity (email first, phone fallback, else null)", () => {
    // Inputs are normalized upstream by extractAgentContact (lower email,
    // digits-only phone >= 7); toAgentKey only applies the e:/p: rule.
    expect(toAgentKey("a@x.com", "5551234567")).toBe("e:a@x.com");
    expect(toAgentKey(null, "5551234567")).toBe("p:5551234567");
    expect(toAgentKey(null, null)).toBeNull();
    expect(extractAgentContact({ buyingAgentPhone: "123" }).phone).toBeNull();
  });
});

describe("SQL aggregates parity", () => {
  const FROM = "2026-03-01T00:00:00Z";
  const TO = "2026-04-01T00:00:00Z";

  function seed(sqlite: DatabaseSync) {
    sqlite.exec(MIG_0035);
    sqlite.exec(MIG_0036);
    sqlite.exec(`
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, total_minor, buying_agent_name, buying_agent_email, buying_agent_phone, agent_key, inspector_names, synced_at) VALUES
        ('o1:spectora:1', 'o1', 'spectora', '1', 'completed', '2026-03-05T10:00:00Z', 50000, 'Agent A', 'a@example.com', NULL, 'e:a@example.com', '["Sam"]', 1),
        ('o1:spectora:2', 'o1', 'spectora', '2', 'completed', '2026-03-06T10:00:00Z', 60000, 'Agent A', 'A@Example.com', NULL, 'e:a@example.com', '["Sam", "Jo"]', 1),
        ('o1:spectora:3', 'o1', 'spectora', '3', 'scheduled', '2026-03-07T10:00:00Z', NULL, 'Agent B', NULL, '5551234567', 'p:5551234567', '["Jo"]', 1),
        ('o1:spectora:4', 'o1', 'spectora', '4', 'cancelled', '2026-03-08T10:00:00Z', 70000, 'Agent C', 'c@example.com', NULL, 'e:c@example.com', '["Sam"]', 1),
        ('o1:spectora:9', 'o1', 'spectora', '9', 'completed', '2024-01-01T10:00:00Z', 80000, 'Agent Old', 'old@example.com', NULL, 'e:old@example.com', '["Sam"]', 1),
        ('o2:spectora:1', 'o2', 'spectora', '1', 'completed', '2026-03-05T10:00:00Z', 999999, 'Other Org', 'other@example.com', NULL, 'e:other@example.com', '["X"]', 1);
      INSERT INTO org_order_inspectors (organization_id, order_id, inspector_name) VALUES
        ('o1', 'o1:spectora:1', 'Sam'),
        ('o1', 'o1:spectora:2', 'Sam'),
        ('o1', 'o1:spectora:2', 'Jo'),
        ('o1', 'o1:spectora:3', 'Jo');
    `);
  }

  function toStored(): StoredOrder[] {
    return [
      { id: "1", status: "completed", scheduledAt: "2026-03-05T10:00:00Z", totalMinor: 50000, inspectorNames: ["Sam"], buyingAgentName: "Agent A", buyingAgentEmail: "a@example.com", buyingAgentPhone: null, serviceNames: [], referralSource: null },
      { id: "2", status: "completed", scheduledAt: "2026-03-06T10:00:00Z", totalMinor: 60000, inspectorNames: ["Sam", "Jo"], buyingAgentName: "Agent A", buyingAgentEmail: "A@Example.com", buyingAgentPhone: null, serviceNames: [], referralSource: null },
      { id: "3", status: "scheduled", scheduledAt: "2026-03-07T10:00:00Z", totalMinor: null, inspectorNames: ["Jo"], buyingAgentName: "Agent B", buyingAgentEmail: null, buyingAgentPhone: "5551234567", serviceNames: [], referralSource: null },
      { id: "4", status: "cancelled", scheduledAt: "2026-03-08T10:00:00Z", totalMinor: 70000, inspectorNames: ["Sam"], buyingAgentName: "Agent C", buyingAgentEmail: "c@example.com", buyingAgentPhone: null, serviceNames: [], referralSource: null },
    ];
  }

  it("totals match rangeTotals and exclude other orgs", async () => {
    const { db, sqlite } = memoryDb();
    seed(sqlite);
    const sql = await getRangeTotals(db, "o1", FROM, TO);
    const js = rangeTotals(toStored(), FROM, TO);
    expect(sql).toEqual({ jobs: js.jobs, completed: js.completed, pending: js.pending, cancelled: js.cancelled, revenueMinor: js.revenueMinor });
    expect(sql.revenueMinor).toBe(110000);
  });

  it("leaderboard matches agentLeaderboard (email case folds, keyless excluded)", async () => {
    const { db, sqlite } = memoryDb();
    seed(sqlite);
    const sqlRows = await getAgentLeaderboard(db, "o1", FROM, TO, 20);
    const jsRows = agentLeaderboard(toStored(), FROM, TO, 20);
    expect(sqlRows.map((r) => [r.key, r.jobs, r.revenueMinor])).toEqual(jsRows.map((r) => [r.key, r.jobs, r.revenueMinor]));
    expect(sqlRows.find((r) => r.key === "e:a@example.com")?.jobs).toBe(2);
  });

  it("inspector stats match inspectorPerformance team-job counting", async () => {
    const { db, sqlite } = memoryDb();
    seed(sqlite);
    const { rows, activeDays } = await getInspectorStats(db, "o1", FROM, TO);
    const js = inspectorPerformance(toStored(), FROM, TO, new Map());
    expect(rows.map((r) => [r.name, r.jobs, r.revenueMinor]).sort()).toEqual(
      js.map((r) => [r.name, r.jobs, r.revenueMinor]).sort(),
    );
    expect(activeDays).toBe(3);
  });

  it("activeDays counts distinct days exactly, past the old 2000-day cap", async () => {
    const { db, sqlite } = memoryDb();
    seed(sqlite);
    // One order per day for 2100 consecutive days, all inside the window.
    const start = Date.parse("2020-01-01T00:00:00Z");
    const values: string[] = [];
    for (let d = 0; d < 2100; d += 1) {
      const iso = new Date(start + d * 86400000).toISOString();
      values.push(`('o1:bulk:${d}', 'o1', 'spectora', 'bulk-${d}', 'completed', '${iso}', 100, '[]', 1)`);
    }
    sqlite.exec(`INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, total_minor, inspector_names, synced_at) VALUES ${values.join(",")}`);
    // Millis-free lower bound: stored ISOs carry .000Z, which sorts before a
    // bare-seconds bound on the same instant, so start a day early.
    const { activeDays } = await getInspectorStats(db, "o1", "2019-12-31T00:00:00Z", "2026-04-01T00:00:00Z");
    // 2100 bulk days plus the 2026-03 fixtures that fall in range (05, 06, 07).
    expect(activeDays).toBe(2103);
  });

  it("monthly totals group by month within the window", async () => {
    const { db, sqlite } = memoryDb();
    seed(sqlite);
    const months = await getMonthlyTotals(db, "o1", "2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(months).toEqual([{ month: "2026-03", jobs: 3, completed: 2, revenueMinor: 110000 }]);
  });

  it("keyset pages cover the window with no dup or miss", async () => {
    const { db, sqlite } = memoryDb();
    seed(sqlite);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const decoded = cursor ? decodeCursor(cursor) : null;
      const { rows, nextCursor } = await listOrdersKeyset(db, "o1", "2024-01-01T00:00:00Z", TO, 2, decoded);
      seen.push(...rows.map((r) => r.id));
      cursor = nextCursor;
      if (!nextCursor) break;
    }
    // Newest first; the o2 row never leaks across orgs.
    expect(seen).toEqual(["o1:spectora:4", "o1:spectora:3", "o1:spectora:2", "o1:spectora:1", "o1:spectora:9"]);
    // Duplicate scheduled_at + id tie-break stays deterministic.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("rejects tampered cursors", () => {
    expect(decodeCursor("not-a-cursor!!")).toBeNull();
    const good = encodeCursor({ scheduledAt: "2026-03-01T00:00:00Z", id: "x" });
    expect(decodeCursor(good)).toEqual({ scheduledAt: "2026-03-01T00:00:00Z", id: "x" });
  });

  it("uses indexed search, not a full scan, for the hot queries", () => {
    const { sqlite } = memoryDb();
    seed(sqlite);
    const plans = [
      sqlite.prepare(`EXPLAIN QUERY PLAN SELECT count(*) FROM org_orders WHERE organization_id = 'o1' AND scheduled_at >= '2026-03-01' AND scheduled_at < '2026-04-01'`).all(),
      sqlite.prepare(`EXPLAIN QUERY PLAN SELECT agent_key, count(*) FROM org_orders WHERE organization_id = 'o1' AND scheduled_at >= '2026-03-01' AND scheduled_at < '2026-04-01' AND status <> 'cancelled' AND agent_key IS NOT NULL GROUP BY agent_key`).all(),
      sqlite.prepare(`EXPLAIN QUERY PLAN SELECT * FROM org_orders WHERE organization_id = 'o1' AND scheduled_at >= '2026-03-01' AND scheduled_at < '2026-04-01' ORDER BY scheduled_at DESC, id DESC LIMIT 50`).all(),
    ] as Array<Array<{ detail: string }>>;
    for (const plan of plans) {
      const text = plan.map((r) => r.detail).join(" | ");
      expect(text).toMatch(/SEARCH/i);
      expect(text).not.toMatch(/SCAN org_orders/i);
    }
  });
});

describe("route hardening", () => {
  const ENV = {} as unknown as Env;
  const USER: SessionUser = { id: "u1", email: "owner@test.com", emailVerified: true };

  function routeDb(): { db: Db; sqlite: DatabaseSync } {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
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
      CREATE TABLE org_order_services (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, order_id TEXT NOT NULL,
        name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'base', amount_minor INTEGER
      );
      CREATE TABLE IF NOT EXISTS org_order_inspectors (
        organization_id TEXT NOT NULL, order_id TEXT NOT NULL, inspector_name TEXT NOT NULL,
        PRIMARY KEY (organization_id, order_id, inspector_name)
      );
      CREATE TABLE org_inspector_targets (
        organization_id TEXT NOT NULL, inspector_name TEXT NOT NULL,
        jobs_per_day INTEGER NOT NULL DEFAULT 2, updated_at INTEGER NOT NULL,
        PRIMARY KEY (organization_id, inspector_name)
      );
      CREATE TABLE org_dashboard_layouts (
        organization_id TEXT PRIMARY KEY, widgets_json TEXT NOT NULL DEFAULT '[]',
        default_range TEXT NOT NULL DEFAULT 'last_12m', updated_at INTEGER NOT NULL
      );
      CREATE TABLE user_dashboard_prefs (
        user_id TEXT NOT NULL, organization_id TEXT NOT NULL,
        preset TEXT NOT NULL DEFAULT 'last_12m', custom_from TEXT, custom_to TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, organization_id)
      );
      CREATE TABLE org_sync_state (
        organization_id TEXT PRIMARY KEY, provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backfilling', cursor_date TEXT,
        last_synced_at INTEGER, total_fetched INTEGER NOT NULL DEFAULT 0,
        error_text TEXT, updated_at INTEGER NOT NULL,
        seed_started_at INTEGER, total_estimate INTEGER,
        orders_total INTEGER NOT NULL DEFAULT 0,
        orders_with_services INTEGER NOT NULL DEFAULT 0
      );
    `);
    const db = drizzle(
      async (sql: string, params: unknown[]) => {
        const statement = sqlite.prepare(sql);
        const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
        return { rows: objectRows.map((row) => Object.values(row)) };
      },
      { schema },
    ) as unknown as Db;
    return { db, sqlite };
  }

  function buildApp(db: Db, role = "admin") {
    const store: MemberStore = {
      getMember: async (orgId, userId) => ((orgId === "o1" || orgId === "o2") && userId === "u1" ? { role } : null),
      isSuperadmin: async () => false,
      seedSuperadmins: async () => undefined,
    };
    return createAnalyticsRoutes({
      session: async () => USER,
      store,
      access: async () => ({ state: "active", planId: "snipe-intelligence", maxUsers: null, allowBriefings: false }),
      ctx: { db, auth: {} as unknown as Auth },
    });
  }

  it("PUT layout writes the authorized org and 403s on body mismatch", async () => {
    const { db } = routeDb();
    const app = buildApp(db);
    const ok = await app.request("/api/analytics/layout?orgId=o1", { method: "PUT", body: JSON.stringify({ orgId: "o1", widgetsJson: "[]", defaultRange: "30d" }) }, ENV);
    expect(ok.status).toBe(200);
    const bad = await app.request("/api/analytics/layout?orgId=o1", { method: "PUT", body: JSON.stringify({ orgId: "o2", widgetsJson: "[]", defaultRange: "30d" }) }, ENV);
    expect(bad.status).toBe(403);
  });

  it("PUT targets 403s on body mismatch", async () => {
    const { db } = routeDb();
    const app = buildApp(db);
    const res = await app.request("/api/analytics/targets?orgId=o1", { method: "PUT", body: JSON.stringify({ orgId: "o2", inspectorName: "Sam", jobsPerDay: 2 }) }, ENV);
    expect(res.status).toBe(403);
  });

  it("refresh honors the 10-second cooldown without running a sync", async () => {
    const { db, sqlite } = routeDb();
    const nowSec = Math.floor(Date.now() / 1000);
    sqlite.exec(`INSERT INTO org_sync_state (organization_id, provider, status, last_synced_at, total_fetched, updated_at) VALUES ('o1', 'spectora', 'live', ${nowSec}, 10, ${nowSec})`);
    const app = buildApp(db);
    // No provider connection is seeded: a real sync run would fail, so a 200
    // with cooledDown proves the cooldown short-circuited before syncing.
    const res = await app.request("/api/analytics/refresh?orgId=o1", { method: "POST", body: JSON.stringify({ orgId: "o1" }) }, ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: null, cooledDown: true });
  });

  it("overview and orders reject invalid ranges with 422", async () => {
    const { db } = routeDb();
    const app = buildApp(db);
    const bad = [
      "/api/analytics/overview?orgId=o1&from=not-a-date&to=2026-04-01T00:00:00Z",
      "/api/analytics/overview?orgId=o1&from=2026-04-01T00:00:00Z&to=2026-03-01T00:00:00Z",
      "/api/analytics/overview?orgId=o1&from=1900-01-01T00:00:00Z&to=2026-04-01T00:00:00Z",
      "/api/analytics/orders?orgId=o1&from=2026-04-01T00:00:00Z&to=2026-03-01T00:00:00Z",
    ];
    for (const url of bad) {
      const res = await app.request(url, {}, ENV);
      expect(res.status).toBe(422);
    }
  });

  it("range reports warehouse min/max per org, null when empty", async () => {
    const { db, sqlite } = routeDb();
    sqlite.exec(`
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, synced_at) VALUES
        ('o1:spectora:1', 'o1', 'spectora', '1', 'completed', '2026-03-05T10:00:00Z', 1),
        ('o1:spectora:2', 'o1', 'spectora', '2', 'completed', '2024-01-01T10:00:00Z', 1),
        ('o1:spectora:3', 'o1', 'spectora', '3', 'completed', NULL, 1);
    `);
    const app = buildApp(db);
    const r1 = await app.request("/api/analytics/range?orgId=o1", {}, ENV);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ range: { minScheduledAt: "2024-01-01T10:00:00Z", maxScheduledAt: "2026-03-05T10:00:00Z" } });
    // o2 is a member org with no orders: nulls, not an error.
    const r2 = await app.request("/api/analytics/range?orgId=o2", {}, ENV);
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ range: { minScheduledAt: null, maxScheduledAt: null } });
  });

  it("status reports cap-aware chunk walk position", async () => {    const { db, sqlite } = routeDb();
    const nowSec = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO org_sync_state (organization_id, provider, status, cursor_date, last_synced_at, total_fetched, updated_at)
      VALUES ('o1', 'spectora', 'backfilling', '2021-11-27T12:00:00.000Z', ${nowSec}, 20000, ${nowSec});
    `);
    const app = buildApp(db);
    const res = await app.request("/api/analytics/status?orgId=o1", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: { backfillChunksDone: number; backfillChunksTotal: number } };
    // Same cursor math as the unit test, evaluated at runtime now.
    const expected = Math.max(0, Math.min(25, Math.round((Date.now() - Date.parse("2021-11-27T12:00:00.000Z")) / 86400000 / 90)));
    expect(body.status.backfillChunksTotal).toBe(25);
    expect(body.status.backfillChunksDone).toBe(expected);
  });

  it("status serves enrichment coverage from counters, null while backfilling", async () => {
    const { db, sqlite } = routeDb();
    const nowSec = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO org_sync_state (organization_id, provider, status, cursor_date, last_synced_at, total_fetched, updated_at, orders_total, orders_with_services)
      VALUES ('o1', 'spectora', 'live', '2021-01-01T00:00:00.000Z', ${nowSec}, 3, ${nowSec}, 2, 1);
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, synced_at) VALUES
        ('o1:spectora:1', 'o1', 'spectora', '1', 'completed', '2026-03-05T10:00:00Z', 1),
        ('o1:spectora:2', 'o1', 'spectora', '2', 'completed', '2026-03-06T10:00:00Z', 1),
        ('o1:spectora:3', 'o1', 'spectora', '3', 'cancelled', '2026-03-07T10:00:00Z', 1);
      INSERT INTO org_order_services (id, organization_id, order_id, name, kind) VALUES
        ('o1:spectora:1:svc:0', 'o1', 'o1:spectora:1', 'General Home Inspection', 'base');
    `);
    const app = buildApp(db);
    const live = await app.request("/api/analytics/status?orgId=o1", {}, ENV);
    expect(live.status).toBe(200);
    // Counters say 2 in scope, 1 with detail: served verbatim, no scan —
    // the rows above exist only to prove the handler never reads them.
    expect((await live.json()) as unknown).toMatchObject({ status: { state: "live", enrichment: { orders: 2, withServices: 1 } } });
    // Stale counters (manual purges bypass the writers) clamp instead of
    // reporting more covered than exist.
    sqlite.exec(`UPDATE org_sync_state SET orders_with_services = 9 WHERE organization_id = 'o1'`);
    const stale = await app.request("/api/analytics/status?orgId=o1", {}, ENV);
    expect((await stale.json()) as unknown).toMatchObject({ status: { enrichment: { orders: 2, withServices: 2 } } });
    sqlite.exec(`UPDATE org_sync_state SET status = 'backfilling' WHERE organization_id = 'o1'`);
    const filling = await app.request("/api/analytics/status?orgId=o1", {}, ENV);
    expect((await filling.json()) as unknown).toMatchObject({ status: { enrichment: null } });
  });

  it("basket never counts another org's service rows for this org's order", async () => {
    const { db, sqlite } = routeDb();
    sqlite.exec(`
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, total_minor, synced_at) VALUES
        ('o1:spectora:1', 'o1', 'spectora', '1', 'completed', '2026-03-05T10:00:00Z', 50000, 1);
      INSERT INTO org_order_services (id, organization_id, order_id, name, kind) VALUES
        ('xeno', 'o2', 'o1:spectora:1', 'Sneaky Service', 'base');
    `);
    const app = buildApp(db);
    const res = await app.request("/api/analytics/overview?orgId=o2&from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { overview: { basket: Array<{ name: string }> } };
    expect(body.overview.basket).toEqual([]);
  });
});
