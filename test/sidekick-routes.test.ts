import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/server/types";
import { createSidekickRoutes } from "../src/server/routes/sidekick";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type {
  AuditInput,
  AuditPublic,
  BriefingPublic,
  BusinessProfile,
  BusinessProfileInput,
  ConnectionInput,
  ConnectionPublic,
  ScheduleInput,
  SchedulePatch,
  SchedulePublic,
  SidekickStore,
  TokenInput,
  TokenPublic,
} from "../src/server/sidekick/store";

const ENV = {
  MCP_ENCRYPTION_KEY: "test-sidekick-key-must-be-long-enough",
  MCP_TOKEN_PEPPER: "pepper-test",
} as unknown as Env;

const USER: SessionUser = { id: "u1", email: "owner@test.com", emailVerified: true };

function memberStore(): MemberStore {
  return {
    getMember: async (orgId, userId) =>
      orgId === "o1" && userId === "u1" ? { role: "admin" } : null,
    isSuperadmin: async () => false,
    seedSuperadmins: async () => undefined,
  };
}

type TestSidekickStore = SidekickStore & {
  seedOAuthGrant: (row: {
    orgId: string;
    clientId?: string;
    name?: string;
    expiresAt: number;
    revokedAt: number | null;
    createdAt?: number;
  }) => void;
  seedBriefing: (row: {
    id: string;
    organizationId: string;
    scheduleId?: string;
    periodKey?: string;
    status?: string;
    briefingText?: string | null;
    createdAt?: Date;
  }) => void;
};

function memorySidekick(): TestSidekickStore {
  const connections = new Map<string, ConnectionPublic & { encryptedCredentials: string }>();
  const tokens = new Map<string, TokenPublic & { tokenHash: string; organizationId: string }>();
  const schedules = new Map<string, SchedulePublic>();
  const briefings = new Map<string, BriefingPublic & { organizationId: string }>();
  const profiles = new Map<string, BusinessProfile>();
  const employeeStates = new Map<string, { organizationId: string; employee: string; active: boolean }>();
  const oauthGrants: Array<{
    orgId: string;
    clientId: string;
    name: string;
    expiresAt: number;
    revokedAt: number | null;
    createdAt: number;
  }> = [];
  return {
    async listConnections(orgId) {
      return [...connections.values()]
        .filter((c) => c.organizationId === orgId)
        .map(({ encryptedCredentials: _e, ...pub }) => pub);
    },
    async getConnection(id, orgId) {
      const c = connections.get(id);
      return c && c.organizationId === orgId ? { ...c, updatedAt: new Date(c.updatedAt) } : null;
    },
    async saveConnection(input: ConnectionInput) {
      const existing = [...connections.values()].find(
        (c) => c.organizationId === input.organizationId && c.provider === input.provider,
      );
      const row = {
        id: existing?.id ?? input.id,
        organizationId: input.organizationId,
        provider: input.provider,
        encryptedCredentials: input.encryptedCredentials,
        status: input.status ?? "connected",
        capabilitiesJson: input.capabilitiesJson ?? null,
        externalAccountId: input.externalAccountId ?? null,
        updatedAt: new Date(),
      };
      connections.set(row.id, row);
      const { encryptedCredentials: _e, ...pub } = row;
      return pub;
    },
    async deleteConnection(id, orgId) {
      const c = connections.get(id);
      if (!c || c.organizationId !== orgId) return false;
      connections.delete(id);
      return true;
    },
    async listTokens(orgId) {
      return [...tokens.values()]
        .filter((t) => t.organizationId === orgId)
        .map(({ tokenHash: _h, organizationId: _o, ...pub }) => pub);
    },
    async createToken(input: TokenInput) {
      tokens.set(input.id, { ...input, lastUsedAt: null, revokedAt: null, createdAt: new Date() });
    },
    async revokeToken(id, orgId) {
      const t = tokens.get(id);
      if (!t || t.organizationId !== orgId) return false;
      tokens.set(id, { ...t, revokedAt: new Date() });
      return true;
    },
    async getPolicy(orgId) {
      return { organizationId: orgId, writePermission: "READ" as const, allowedActions: [] };
    },
    async savePolicy(orgId, input) {
      return { organizationId: orgId, ...input };
    },
    async listSchedules(orgId) {
      return [...schedules.values()].filter((s) => s.organizationId === orgId);
    },
    async createSchedule(input: ScheduleInput) {
      const row: SchedulePublic = {
        ...input,
        enabled: true,
        lastRunAt: null,
      };
      schedules.set(row.id, row);
      return row;
    },
    async updateSchedule(id, orgId, patch: Partial<SchedulePatch>) {
      const s = schedules.get(id);
      if (!s || s.organizationId !== orgId) return null;
      const next = { ...s, ...patch };
      schedules.set(id, next);
      return next;
    },
    async deleteSchedule(id, orgId) {
      const s = schedules.get(id);
      if (!s || s.organizationId !== orgId) return false;
      schedules.delete(id);
      return true;
    },
    async listBriefings(orgId, limit, offset = 0) {
      return [...briefings.values()]
        .filter((b) => b.organizationId === orgId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(offset, offset + limit)
        .map(({ organizationId: _o, ...pub }) => pub);
    },
    async latestBriefing() {
      return null;
    },
    async deleteBriefing(id, orgId) {
      const b = briefings.get(id);
      if (!b || b.organizationId !== orgId) return false;
      briefings.delete(id);
      return true;
    },
    async listAudit() {
      return [] as AuditPublic[];
    },
    async logAudit(_entry: AuditInput) {},
    async getBusinessProfile(orgId) {
      return profiles.get(orgId) ?? null;
    },
    async saveBusinessProfile(orgId, input: BusinessProfileInput) {
      const row = { organizationId: orgId, ...input };
      profiles.set(orgId, row);
      return row;
    },
    async listEmployeeStates(orgId) {
      return [...employeeStates.values()].filter((s) => s.organizationId === orgId);
    },
    async saveEmployeeState(orgId, employee, active) {
      const row = { organizationId: orgId, employee, active };
      employeeStates.set(`${orgId}:${employee}`, row);
      return row;
    },
    async hasActiveOAuthGrant(orgId, nowSec) {
      return oauthGrants.some((g) => g.orgId === orgId && g.revokedAt === null && g.expiresAt > nowSec);
    },
    async listOAuthGrants(orgId, nowSec) {
      const live = oauthGrants.filter((g) => g.orgId === orgId && g.revokedAt === null && g.expiresAt > nowSec);
      const byClient = new Map<string, { name: string; connectedAt: number | null; activeTokens: number }>();
      for (const g of live) {
        const entry = byClient.get(g.clientId) ?? { name: g.name, connectedAt: null as number | null, activeTokens: 0 };
        entry.activeTokens += 1;
        if (entry.connectedAt === null || g.createdAt < entry.connectedAt) entry.connectedAt = g.createdAt;
        byClient.set(g.clientId, entry);
      }
      return [...byClient.entries()].map(([clientId, e]) => ({ clientId, ...e }));
    },
    async revokeOAuthGrants(orgId, clientId, nowSec) {
      let count = 0;
      for (const g of oauthGrants) {
        if (g.orgId === orgId && g.clientId === clientId && g.revokedAt === null) {
          g.revokedAt = nowSec;
          count += 1;
        }
      }
      return count;
    },
    seedOAuthGrant(row) {
      oauthGrants.push({
        clientId: "client-1",
        name: "Test Client",
        createdAt: Date.now(),
        ...row,
      });
    },
    seedBriefing(row) {
      briefings.set(row.id, {
        scheduleId: row.scheduleId ?? "sched-1",
        periodKey: row.periodKey ?? "2026-10-19",
        status: row.status ?? "delivered",
        briefingText: row.briefingText ?? null,
        errorText: null,
        completedAt: null,
        createdAt: row.createdAt ?? new Date(),
        ...row,
      });
    },
  };
}

type AccessOverride = { state: "trial" | "active" | "expired"; planId: string; maxUsers: number | null; allowBriefings: boolean };

function buildApp(
  sidekick: SidekickStore,
  snapshot?: (env: Env, orgId: string, provider: "spectora" | "isn") => Promise<never>,
  access?: AccessOverride,
) {
  return createSidekickRoutes({
    session: async () => USER,
    store: memberStore(),
    sidekick,
    snapshot: snapshot as never,
    access: async () => access ?? { state: "active", planId: "pro", maxUsers: null, allowBriefings: true },
    ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
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

describe("sidekick connections", () => {
  it("saves a connection without ever returning secret material", async () => {
    const app = buildApp(memorySidekick());
    const res = await req(app, "/api/sidekick/connections", { orgId: "o1", provider: "spectora", apiKey: "sk_live" }, "POST");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connection: Record<string, unknown> };
    expect(body.connection.provider).toBe("spectora");
    expect("encryptedCredentials" in body.connection).toBe(false);
    expect(JSON.stringify(body)).not.toContain("sk_live");

    const list = (await (await req(app, "/api/sidekick/connections?orgId=o1")).json()) as {
      connections: ConnectionPublic[];
    };
    expect(list.connections).toHaveLength(1);
    expect("encryptedCredentials" in list.connections[0]!).toBe(false);
  });

  it("rejects connections with no credentials", async () => {
    const app = buildApp(memorySidekick());
    const res = await req(app, "/api/sidekick/connections", { orgId: "o1", provider: "spectora" }, "POST");
    expect(res.status).toBe(422);
  });

  it("allows only one platform per org (same provider may reconnect)", async () => {
    const app = buildApp(memorySidekick());
    const first = await req(app, "/api/sidekick/connections", { orgId: "o1", provider: "spectora", apiKey: "k1" }, "POST");
    expect(first.status).toBe(200);
    const second = await req(
      app,
      "/api/sidekick/connections",
      { orgId: "o1", provider: "isn", companyKey: "c", host: "test.isn", accessKey: "a", secretKey: "s" },
      "POST",
    );
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error?: string }).error ?? "").toMatch(/already connected/i);
    const reconnect = await req(app, "/api/sidekick/connections", { orgId: "o1", provider: "spectora", apiKey: "k3" }, "POST");
    expect(reconnect.status).toBe(200);
  });

  it("deletes a connection", async () => {
    const store = memorySidekick();
    const app = buildApp(store);
    await req(app, "/api/sidekick/connections", { orgId: "o1", provider: "spectora", apiKey: "k" }, "POST");
    const list = (await (await req(app, "/api/sidekick/connections?orgId=o1")).json()) as {
      connections: ConnectionPublic[];
    };
    const del = await req(app, `/api/sidekick/connections/${list.connections[0]!.id}?orgId=o1`, undefined, "DELETE");
    expect(del.status).toBe(200);
  });
});

describe("sidekick ISN connections", () => {
  const isnBody = { orgId: "o1", provider: "isn", companyKey: "acme", host: "test.isn", accessKey: "ak", secretKey: "sk" };

  function stubMe(payload: unknown, ok = true, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok, status, json: async () => payload }) as unknown as Response),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves an ISN connection after a live /me check, never returning secrets", async () => {
    stubMe({ status: "ok", me: "owner", message: "" });
    const app = buildApp(memorySidekick());
    const res = await req(app, "/api/sidekick/connections", isnBody, "POST");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connection: Record<string, unknown> };
    expect(body.connection.provider).toBe("isn");
    expect("encryptedCredentials" in body.connection).toBe(false);
    const dumped = JSON.stringify(body);
    expect(dumped).not.toContain("ak");
    expect(dumped).not.toContain("sk");
    const caps = JSON.parse(String((body.connection as { capabilitiesJson?: string }).capabilitiesJson ?? "{}")) as {
      read: string[];
      write: unknown[];
    };
    expect(caps.read).toEqual(["clients", "orders", "agents", "events"]);
    expect(caps.write).toEqual([
      "create_order", "update_order", "reschedule_order", "delete_order",
      "create_client", "update_client", "delete_client",
      "create_agent", "update_agent", "delete_agent",
    ]);
  });

  it("rejects ISN saves when /me fails, with sanitized detail", async () => {
    stubMe({ status: "ok", me: null, message: "" }, false, 401);
    const app = buildApp(memorySidekick());
    const res = await req(app, "/api/sidekick/connections", isnBody, "POST");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error ?? "").toMatch(/credential check failed/i);
    expect(body.error ?? "").not.toContain("sk");
  });

  it("rejects coming-soon providers with a 422", async () => {
    const app = buildApp(memorySidekick());
    for (const provider of ["servicetitan", "housecallpro", "jobber"]) {
      const res = await req(app, "/api/sidekick/connections", { orgId: "o1", provider, apiKey: "k" }, "POST");
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error?: string }).error ?? "").toMatch(/coming soon/i);
    }
  });

  it("rejects mixed provider credential shapes", async () => {
    const app = buildApp(memorySidekick());
    const isnWithApiKey = await req(app, "/api/sidekick/connections", { ...isnBody, apiKey: "k" }, "POST");
    expect(isnWithApiKey.status).toBe(422);
    const spectoraWithIsn = await req(
      app,
      "/api/sidekick/connections",
      { orgId: "o1", provider: "spectora", apiKey: "k", companyKey: "c" },
      "POST",
    );
    expect(spectoraWithIsn.status).toBe(422);
    const isnMissing = await req(
      app,
      "/api/sidekick/connections",
      { orgId: "o1", provider: "isn", companyKey: "c", accessKey: "a" },
      "POST",
    );
    expect(isnMissing.status).toBe(422);
    const isnMissingHost = await req(
      app,
      "/api/sidekick/connections",
      { orgId: "o1", provider: "isn", companyKey: "c", accessKey: "a", secretKey: "s" },
      "POST",
    );
    expect(isnMissingHost.status).toBe(422);
    expect(((await isnMissingHost.json()) as { error?: string }).error ?? "").toMatch(/host/i);
  });
});

describe("sidekick MCP tokens", () => {
  it("shows the token once at creation and never again", async () => {
    const app = buildApp(memorySidekick());
    const created = (await (
      await req(app, "/api/sidekick/mcp-tokens", { orgId: "o1", name: "Claude" }, "POST")
    ).json()) as { id: string; token: string };
    expect(created.token.startsWith("bs_mcp_")).toBe(true);

    const list = (await (await req(app, "/api/sidekick/mcp-tokens?orgId=o1")).json()) as {
      tokens: Array<Record<string, unknown>>;
    };
    expect(list.tokens).toHaveLength(1);
    expect("token" in list.tokens[0]!).toBe(false);
    expect("tokenHash" in list.tokens[0]!).toBe(false);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const revoke = await req(app, `/api/sidekick/mcp-tokens/${created.id}/revoke?orgId=o1`, {}, "POST");
    expect(revoke.status).toBe(200);
  });
});

describe("sidekick AI employees", () => {
  interface EmployeeRow { name: string; title: string; tier: string; entitled: boolean; active: boolean }

  async function list(app: ReturnType<typeof buildApp>) {
    const res = await req(app, "/api/sidekick/employees?orgId=o1");
    expect(res.status).toBe(200);
    return (await res.json()) as { employees: EmployeeRow[] };
  }

  it("defaults every employee to active on Pro-tier orgs", async () => {
    const { employees } = await list(buildApp(memorySidekick()));
    expect(employees).toHaveLength(7);
    expect(employees.every((e) => e.entitled && e.active)).toBe(true);
  });

  it("defaults Pro employees to inactive on capped (Starter) plans", async () => {
    const capped = { state: "active" as const, planId: "starter", maxUsers: 1, allowBriefings: false };
    const { employees } = await list(buildApp(memorySidekick(), undefined, capped));
    const pro = employees.filter((e) => e.tier === "pro");
    expect(pro).toHaveLength(4);
    expect(pro.every((e) => !e.entitled && !e.active)).toBe(true);
    expect(employees.filter((e) => e.tier === "starter").every((e) => e.entitled && e.active)).toBe(true);
  });

  it("deactivates and reactivates an entitled employee", async () => {
    const app = buildApp(memorySidekick());
    const off = await req(app, "/api/sidekick/employees/ask-cfo", { orgId: "o1", active: false }, "PATCH");
    expect(off.status).toBe(200);
    expect(((await off.json()) as { employee: { active: boolean } }).employee.active).toBe(false);
    expect((await list(app)).employees.find((e) => e.name === "ask-cfo")!.active).toBe(false);
    const on = await req(app, "/api/sidekick/employees/ask-cfo", { orgId: "o1", active: true }, "PATCH");
    expect(on.status).toBe(200);
    expect((await list(app)).employees.find((e) => e.name === "ask-cfo")!.active).toBe(true);
  });

  it("refuses Pro activation on capped plans but allows deactivation", async () => {
    const capped = { state: "active" as const, planId: "starter", maxUsers: 1, allowBriefings: false };
    const app = buildApp(memorySidekick(), undefined, capped);
    const blocked = await req(app, "/api/sidekick/employees/ask-revenue", { orgId: "o1", active: true }, "PATCH");
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error?: string }).error ?? "").toMatch(/pro feature/i);
    const off = await req(app, "/api/sidekick/employees/ask-revenue", { orgId: "o1", active: false }, "PATCH");
    expect(off.status).toBe(200);
  });

  it("404s unknown employees and 422s bad payloads", async () => {
    const app = buildApp(memorySidekick());
    expect((await req(app, "/api/sidekick/employees/ask-nope", { orgId: "o1", active: false }, "PATCH")).status).toBe(404);
    expect((await req(app, "/api/sidekick/employees/ask-cfo", { orgId: "o1" }, "PATCH")).status).toBe(422);
  });
});

describe("sidekick policy + schedules + overview", () => {
  it("reads and saves the write policy", async () => {
    const app = buildApp(memorySidekick());
    const before = (await (await req(app, "/api/sidekick/policy?orgId=o1")).json()) as {
      policy: { writePermission: string };
    };
    expect(before.policy.writePermission).toBe("READ");
    const saved = await req(
      app,
      "/api/sidekick/policy",
      { orgId: "o1", writePermission: "SUGGEST", allowedActions: ["reschedule_order"] },
      "PATCH",
    );
    expect(saved.status).toBe(200);
  });

  it("validates schedule times", async () => {
    const app = buildApp(memorySidekick());
    const bad = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "25:00" },
      "POST",
    );
    expect(bad.status).toBe(422);
    const good = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:00" },
      "POST",
    );
    expect(good.status).toBe(201);
  });

  it("only accepts whole-hour local times (the Cron ticks hourly)", async () => {
    const app = buildApp(memorySidekick());
    // Minutes other than 00 can never be picked up by an hourly heartbeat, so
    // the API refuses them instead of storing a schedule that silently never
    // fires.
    const offHour = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:30" },
      "POST",
    );
    expect(offHour.status).toBe(422);
    expect(((await offHour.json()) as { error: string }).error).toMatch(/whole hour/i);

    const onHour = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:00" },
      "POST",
    );
    expect(onHour.status).toBe(201);
  });

  it("stores the cadence day in ruleJson, narrowed to the schedule type", async () => {
    const store = memorySidekick();
    const app = buildApp(store);
    const weekly = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "weekly_review", timezone: "America/New_York", localTime: "08:00", dayOfWeek: 3, dayOfMonth: 9 },
      "POST",
    );
    expect(weekly.status).toBe(201);
    const monthly = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "monthly_review", timezone: "America/New_York", localTime: "08:00", dayOfMonth: 31 },
      "POST",
    );
    expect(monthly.status).toBe(201);
    const { schedules } = (await (await req(app, "/api/sidekick/schedules?orgId=o1")).json()) as {
      schedules: SchedulePublic[];
    };
    expect(JSON.parse(schedules.find((s) => s.type === "weekly_review")!.ruleJson)).toEqual({ dayOfWeek: 3 });
    expect(JSON.parse(schedules.find((s) => s.type === "monthly_review")!.ruleJson)).toEqual({ dayOfMonth: 31 });
  });

  it("refuses a second schedule of the same cadence", async () => {
    const app = buildApp(memorySidekick());
    const body = { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:00" };
    expect((await req(app, "/api/sidekick/schedules", body, "POST")).status).toBe(201);
    const dup = await req(app, "/api/sidekick/schedules", body, "POST");
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toMatch(/already exists/i);
  });

  it("edits an existing schedule and recomputes its fire time", async () => {
    const store = memorySidekick();
    const app = buildApp(store);
    const created = (await (
      await req(
        app,
        "/api/sidekick/schedules",
        { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:00" },
        "POST",
      )
    ).json()) as { schedule: SchedulePublic };
    const id = created.schedule.id;
    const before = created.schedule.nextRunAt;

    const edited = (await (
      await req(
        app,
        `/api/sidekick/schedules/${id}?orgId=o1`,
        { localTime: "09:00" },
        "PATCH",
      )
    ).json()) as { schedule: SchedulePublic };

    expect(edited.schedule.localTime).toBe("09:00");
    // The stored fire time must move with the edit, or the schedule would keep
    // firing at the old hour until the next Cron tick.
    expect(edited.schedule.nextRunAt).not.toEqual(before);
  });

  it("edits the cadence day without changing the hour", async () => {
    const app = buildApp(memorySidekick());
    const created = (await (
      await req(
        app,
        "/api/sidekick/schedules",
        { orgId: "o1", type: "weekly_review", timezone: "America/New_York", localTime: "08:00", dayOfWeek: 1 },
        "POST",
      )
    ).json()) as { schedule: SchedulePublic };

    const edited = (await (
      await req(
        app,
        `/api/sidekick/schedules/${created.schedule.id}?orgId=o1`,
        { dayOfWeek: 4 },
        "PATCH",
      )
    ).json()) as { schedule: SchedulePublic };

    expect(JSON.parse(edited.schedule.ruleJson)).toEqual({ dayOfWeek: 4 });
    expect(edited.schedule.localTime).toBe("08:00");
  });

  it("refuses to move a schedule onto a cadence that is taken", async () => {
    const app = buildApp(memorySidekick());
    const morning = await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:00" },
      "POST",
    );
    await req(
      app,
      "/api/sidekick/schedules",
      { orgId: "o1", type: "weekly_review", timezone: "America/New_York", localTime: "07:00" },
      "POST",
    );
    const { schedule } = (await morning.json()) as { schedule: SchedulePublic };
    const conflict = await req(
      app,
      `/api/sidekick/schedules/${schedule.id}?orgId=o1`,
      { type: "weekly_review" },
      "PATCH",
    );
    expect(conflict.status).toBe(409);
  });

  it("drops the other cadence's day when the type changes", async () => {
    const app = buildApp(memorySidekick());
    const created = (await (
      await req(
        app,
        "/api/sidekick/schedules",
        { orgId: "o1", type: "weekly_review", timezone: "America/New_York", localTime: "08:00", dayOfWeek: 3 },
        "POST",
      )
    ).json()) as { schedule: SchedulePublic };

    // A weekly schedule stores a weekday. Moving it to monthly must not keep
    // the weekday behind: each cadence reads only its own field.
    const edited = (await (
      await req(
        app,
        `/api/sidekick/schedules/${created.schedule.id}?orgId=o1`,
        { type: "monthly_review", dayOfMonth: 12 },
        "PATCH",
      )
    ).json()) as { schedule: SchedulePublic };

    expect(JSON.parse(edited.schedule.ruleJson)).toEqual({ dayOfMonth: 12 });
  });

  it("returns 404 when editing a schedule the workspace does not own", async () => {
    const store = memorySidekick();
    const app = buildApp(store);
    // A schedule owned by another workspace must not be editable from here.
    await store.createSchedule({
      id: "foreign",
      organizationId: "o2",
      type: "morning_briefing",
      timezone: "America/New_York",
      localTime: "07:00",
      ruleJson: "{}",
      deliveryJson: "{}",
      nextRunAt: new Date(Date.UTC(2026, 8, 11)),
    });

    const res = await req(
      app,
      "/api/sidekick/schedules/foreign?orgId=o1",
      { localTime: "09:00" },
      "PATCH",
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown schedule id", async () => {
    const app = buildApp(memorySidekick());
    const res = await req(
      app,
      "/api/sidekick/schedules/does-not-exist?orgId=o1",
      { localTime: "09:00" },
      "PATCH",
    );
    expect(res.status).toBe(404);
  });

  it("pages briefings and deletes one within the org", async () => {
    const store = memorySidekick();
    const app = buildApp(store);
    for (let i = 0; i < 12; i++) {
      store.seedBriefing({
        id: `b${i}`,
        organizationId: "o1",
        briefingText: `briefing ${i}`,
        createdAt: new Date(Date.UTC(2026, 9, 19, 0, i)),
      });
    }
    store.seedBriefing({ id: "other", organizationId: "o2" });

    const first = (await (await req(app, "/api/sidekick/briefings?orgId=o1&limit=10&page=1")).json()) as {
      briefings: BriefingPublic[];
      page: number;
      limit: number;
      hasMore: boolean;
    };
    expect(first.briefings).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    expect(first.page).toBe(1);

    const second = (await (await req(app, "/api/sidekick/briefings?orgId=o1&limit=10&page=2")).json()) as {
      briefings: BriefingPublic[];
      hasMore: boolean;
    };
    expect(second.briefings).toHaveLength(2);
    expect(second.hasMore).toBe(false);

    // Another org's briefing is invisible and undeletable.
    expect((await req(app, "/api/sidekick/briefings/other?orgId=o1", {}, "DELETE")).status).toBe(404);
    expect((await req(app, "/api/sidekick/briefings/b0?orgId=o1", {}, "DELETE")).status).toBe(200);
    expect((await req(app, "/api/sidekick/briefings/b0?orgId=o1", {}, "DELETE")).status).toBe(404);
  });

  it("returns an overview without provider calls", async () => {
    const app = buildApp(memorySidekick());
    const res = await req(app, "/api/sidekick/overview?orgId=o1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { overview: Record<string, unknown> };
    expect(Object.keys(body.overview).sort()).toEqual(
      ["activeTokens", "connections", "enabledSchedules", "latestBriefing", "oauthConnected", "policy"].sort(),
    );
    expect(body.overview.oauthConnected).toBe(false);
  });

  it("reports oauthConnected for live grants only", async () => {
    const store = memorySidekick();
    const nowSec = Math.floor(Date.now() / 1000);
    const app = buildApp(store);
    store.seedOAuthGrant({ orgId: "o1", expiresAt: nowSec - 10, revokedAt: null });
    store.seedOAuthGrant({ orgId: "o1", expiresAt: nowSec + 3600, revokedAt: nowSec });
    store.seedOAuthGrant({ orgId: "other", expiresAt: nowSec + 3600, revokedAt: null });
    expect(
      ((await (await req(app, "/api/sidekick/overview?orgId=o1")).json()) as { overview: { oauthConnected: boolean } })
        .overview.oauthConnected,
    ).toBe(false);
    store.seedOAuthGrant({ orgId: "o1", expiresAt: nowSec + 3600, revokedAt: null });
    expect(
      ((await (await req(app, "/api/sidekick/overview?orgId=o1")).json()) as { overview: { oauthConnected: boolean } })
        .overview.oauthConnected,
    ).toBe(true);
  });

  it("lists OAuth grants and disconnects an app", async () => {
    const store = memorySidekick();
    const nowSec = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();
    const app = buildApp(store);
    store.seedOAuthGrant({ orgId: "o1", clientId: "claude", name: "Claude", expiresAt: nowSec + 3600, revokedAt: null, createdAt: nowMs - 2000 });
    store.seedOAuthGrant({ orgId: "o1", clientId: "claude", name: "Claude", expiresAt: nowSec + 3600, revokedAt: null, createdAt: nowMs });
    store.seedOAuthGrant({ orgId: "o1", clientId: "stale", name: "Stale", expiresAt: nowSec - 10, revokedAt: null, createdAt: nowMs });
    const listed = (await (await req(app, "/api/sidekick/oauth-grants?orgId=o1")).json()) as {
      grants: Array<{ clientId: string; name: string; connectedAt: number; activeTokens: number }>;
    };
    expect(listed.grants).toHaveLength(1);
    expect(listed.grants[0]).toMatchObject({ clientId: "claude", name: "Claude", activeTokens: 2, connectedAt: nowMs - 2000 });

    const revoked = await req(app, "/api/sidekick/oauth-grants/claude/revoke?orgId=o1", {}, "POST");
    expect(revoked.status).toBe(200);
    expect(((await revoked.json()) as { revoked: number }).revoked).toBe(2);
    expect(
      ((await (await req(app, "/api/sidekick/oauth-grants?orgId=o1")).json()) as { grants: unknown[] }).grants,
    ).toHaveLength(0);
    expect(
      ((await (await req(app, "/api/sidekick/overview?orgId=o1")).json()) as { overview: { oauthConnected: boolean } })
        .overview.oauthConnected,
    ).toBe(false);
    expect((await req(app, "/api/sidekick/oauth-grants/claude/revoke?orgId=o1", {}, "POST")).status).toBe(404);
    expect((await req(app, "/api/sidekick/oauth-grants/nope/revoke?orgId=o1", {}, "POST")).status).toBe(404);
  });

  it("maps a missing connection to 409 on snapshot", async () => {
    const app = buildApp(memorySidekick(), async () => {
      throw new Error("No spectora connection configured.");
    });
    const res = await req(app, "/api/sidekick/snapshot?orgId=o1&provider=spectora");
    expect(res.status).toBe(409);
  });
});

describe("sidekick business profile", () => {  it("returns null when unset, saves and returns afterwards", async () => {
    const app = buildApp(memorySidekick());
    const empty = (await (await req(app, "/api/sidekick/business-profile?orgId=o1")).json()) as {
      profile: null;
    };
    expect(empty.profile).toBeNull();
    const saved = await req(
      app,
      "/api/sidekick/business-profile",
      { orgId: "o1", businessName: "Acme Home", trade: "Home inspection", teamSize: "" },
      "PUT",
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { profile: { businessName: string; teamSize: null } };
    expect(body.profile.businessName).toBe("Acme Home");
    expect(body.profile.teamSize).toBeNull();
    const again = (await (await req(app, "/api/sidekick/business-profile?orgId=o1")).json()) as {
      profile: { trade: string };
    };
    expect(again.profile.trade).toBe("Home inspection");
  });

  it("rejects invalid payloads", async () => {
    const app = buildApp(memorySidekick());
    const res = await req(app, "/api/sidekick/business-profile", { orgId: "o1", teamSize: 42 }, "PUT");
    expect(res.status).toBe(422);
  });
});

describe("sidekick access gating", () => {
  function gatedApp(state: "trial" | "active" | "expired", allowBriefings = true) {
    return createSidekickRoutes({
      session: async () => USER,
      store: memberStore(),
      sidekick: memorySidekick(),
      access: async () => ({ state, planId: "pro", maxUsers: null, allowBriefings }),
      ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
    });
  }

  it("402s gated orgs on sidekick APIs, business profile stays open", async () => {
    const app = gatedApp("expired");
    expect((await req(app, "/api/sidekick/connections?orgId=o1")).status).toBe(402);
    expect((await req(app, "/api/sidekick/overview?orgId=o1")).status).toBe(402);
    expect((await req(app, "/api/sidekick/business-profile?orgId=o1")).status).toBe(200);
  });

  it("trials pass the gate", async () => {
    const app = gatedApp("trial");
    expect((await req(app, "/api/sidekick/connections?orgId=o1")).status).toBe(200);
  });

  it("blocks schedule create/enable without the Pro briefings flag", async () => {
    const app = gatedApp("active", false);
    const body = { orgId: "o1", type: "morning_briefing", timezone: "America/New_York", localTime: "07:00" };
    expect((await req(app, "/api/sidekick/schedules", body, "POST")).status).toBe(403);
  });
});

beforeEach(() => {});
