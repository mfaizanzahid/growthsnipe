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
const USER2: SessionUser = { id: "u2", email: "teammate@test.com", emailVerified: true };

function memberStore(): MemberStore {
  return {
    getMember: async (orgId, userId) =>
      orgId === "o1" && (userId === "u1" || userId === "u2") ? { role: "user" } : null,
    isSuperadmin: async () => false,
    seedSuperadmins: async () => undefined,
  };
}

function memoryDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE user_dashboard_prefs (
      user_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      preset TEXT NOT NULL DEFAULT 'last_12m',
      custom_from TEXT,
      custom_to TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, organization_id)
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

function buildApp(db: Db, user: SessionUser) {
  return createAnalyticsRoutes({
    session: async () => user,
    store: memberStore(),
    access: async () => ({ state: "active", planId: "snipe-intelligence", maxUsers: null, allowBriefings: false }),
    ctx: { db, auth: {} as unknown as Auth },
  });
}

function req(app: ReturnType<typeof buildApp>, path: string, body?: unknown, method = "GET") {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    ENV,
  );
}

describe("analytics period prefs", () => {
  it("returns null when the user never picked a period", async () => {
    const app = buildApp(memoryDb(), USER);
    const res = await req(app, "/api/analytics/period?orgId=o1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ period: null });
  });

  it("saves and reads back the user's own preset", async () => {
    const app = buildApp(memoryDb(), USER);
    const put = await req(app, "/api/analytics/period?orgId=o1", { orgId: "o1", preset: "cur_month" }, "PUT");
    expect(put.status).toBe(200);
    const get = await req(app, "/api/analytics/period?orgId=o1");
    expect(await get.json()).toEqual({ period: { preset: "cur_month", customFrom: null, customTo: null } });
  });

  it("stores custom dates with the custom preset", async () => {
    const app = buildApp(memoryDb(), USER);
    await req(
      app,
      "/api/analytics/period?orgId=o1",
      { orgId: "o1", preset: "custom", customFrom: "2026-01-01", customTo: "2026-03-31" },
      "PUT",
    );
    const get = await req(app, "/api/analytics/period?orgId=o1");
    expect(await get.json()).toEqual({
      period: { preset: "custom", customFrom: "2026-01-01", customTo: "2026-03-31" },
    });
  });

  it("keeps each member's choice separate", async () => {
    const db = memoryDb();
    await req(buildApp(db, USER), "/api/analytics/period?orgId=o1", { orgId: "o1", preset: "5y" }, "PUT");
    await req(buildApp(db, USER2), "/api/analytics/period?orgId=o1", { orgId: "o1", preset: "30d" }, "PUT");
    const one = await req(buildApp(db, USER), "/api/analytics/period?orgId=o1");
    const two = await req(buildApp(db, USER2), "/api/analytics/period?orgId=o1");
    expect(((await one.json()) as { period: { preset: string } }).period.preset).toBe("5y");
    expect(((await two.json()) as { period: { preset: string } }).period.preset).toBe("30d");
  });

  it("422s on unknown presets and bad dates", async () => {
    const app = buildApp(memoryDb(), USER);
    expect((await req(app, "/api/analytics/period?orgId=o1", { orgId: "o1", preset: "fortnight" }, "PUT")).status).toBe(422);
    expect(
      (await req(app, "/api/analytics/period?orgId=o1", { orgId: "o1", preset: "custom", customFrom: "yesterday" }, "PUT")).status,
    ).toBe(422);
  });

  it("401s without a session", async () => {
    const app = createAnalyticsRoutes({
      session: async () => null,
      store: memberStore(),
      access: async () => ({ state: "active", planId: "snipe-intelligence", maxUsers: null, allowBriefings: false }),
      ctx: { db: memoryDb(), auth: {} as unknown as Auth },
    });
    expect((await app.request("/api/analytics/period?orgId=o1", {}, ENV)).status).toBe(401);
  });
});
