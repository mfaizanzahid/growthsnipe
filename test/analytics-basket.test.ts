import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import { createAnalyticsRoutes } from "../src/server/routes/analytics";
import type { Env } from "../src/server/types";
import type { Auth } from "../src/server/auth";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Db } from "../src/server/repositories/db";

const ENV = {} as unknown as Env;
const USER: SessionUser = { id: "u1", email: "owner@test.com", emailVerified: true };

function memoryDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
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
    CREATE TABLE org_order_services (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, order_id TEXT NOT NULL,
      name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'base', amount_minor INTEGER
    );
    CREATE TABLE org_inspector_targets (
      organization_id TEXT NOT NULL, inspector_name TEXT NOT NULL,
      jobs_per_day INTEGER NOT NULL DEFAULT 2, updated_at INTEGER NOT NULL,
      PRIMARY KEY (organization_id, inspector_name)
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

function buildApp(db: Db) {
  const store: MemberStore = {
    getMember: async (orgId, userId) => (orgId === "o1" && userId === "u1" ? { role: "viewer" } : null),
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

describe("overview service coverage", () => {
  it("reports per-range order coverage and aggregates basket from services", async () => {
    const { db, sqlite } = memoryDb();
    sqlite.exec(`
      INSERT INTO org_orders (id, organization_id, provider, provider_order_id, status, scheduled_at, total_minor, synced_at) VALUES
        ('o1:isn:a', 'o1', 'isn', 'a', 'completed', '2026-03-01T10:00:00Z', 50000, 1),
        ('o1:isn:b', 'o1', 'isn', 'b', 'completed', '2026-03-02T10:00:00Z', 60000, 1),
        ('o1:isn:c', 'o1', 'isn', 'c', 'cancelled', '2026-03-03T10:00:00Z', 70000, 1),
        ('o1:isn:d', 'o1', 'isn', 'd', 'completed', '2024-01-01T10:00:00Z', 80000, 1);
      INSERT INTO org_order_services (id, organization_id, order_id, name, kind) VALUES
        ('o1:isn:a:svc:0', 'o1', 'o1:isn:a', 'General Home Inspection', 'base'),
        ('o1:isn:a:svc:1', 'o1', 'o1:isn:a', 'Radon', 'addon');
    `);
    const app = buildApp(db);
    const res = await app.request(
      "/api/analytics/overview?orgId=o1&from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z",
      {},
      ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      overview: {
        basket: Array<{ name: string; jobs: number; revenueMinor: number }>;
        serviceCoverage: { orders: number; withServices: number };
      };
    };
    // Cancelled excluded from the denominator; only order A carries services.
    expect(body.overview.serviceCoverage).toEqual({ orders: 2, withServices: 1 });
    expect([...body.overview.basket].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "General Home Inspection", jobs: 1, revenueMinor: 50000 },
      { name: "Radon", jobs: 1, revenueMinor: 50000 },
    ]);
  });
});
