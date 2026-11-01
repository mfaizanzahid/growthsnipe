import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";
import type { Auth } from "../src/server/auth";
import { captureEmails } from "../src/server/lib/email";
import { createLoopLibraryRoutes } from "../src/server/routes/loop-library";
import { createSuperadminRoutes } from "../src/server/routes/superadmin";
import { memoryStore } from "./memory-store";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Gateway } from "../src/server/billing/gateway";
import { runDueMarketing } from "../src/server/marketing/runner";
import { verifyLeadToken, signLeadId } from "../src/server/marketing/tokens";
import { stepsFor, WELCOME_SEQUENCE } from "../src/server/marketing/sequences";
import { findLoopLeadByEmail, listMarketingSendsForLead } from "../src/server/repositories/marketing";

const SECRET = "marketing_test_secret";
const ENV = {
  APP_BASE_URL: "https://growthsnipe.test",
  BETTER_AUTH_SECRET: "auth_secret",
  MARKETING_TOKEN_SECRET: SECRET,
} as unknown as Env;

const BOSS: SessionUser = { id: "u9", email: "boss@test.com", emailVerified: true };

function testDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE loop_library_leads (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      trade TEXT NOT NULL,
      software TEXT,
      monthly_volume TEXT,
      consent_at INTEGER NOT NULL,
      consent_text_version TEXT NOT NULL DEFAULT 'v1',
      unsubscribed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE marketing_sends (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
      email TEXT NOT NULL,
      sequence TEXT NOT NULL,
      step_key TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      sent_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX marketing_sends_dedupe_idx ON marketing_sends (email, sequence, step_key);
    CREATE INDEX marketing_sends_due_idx ON marketing_sends (status, due_at);
    CREATE TABLE marketing_suppressions (
      email TEXT PRIMARY KEY,
      reason TEXT NOT NULL DEFAULT 'unsubscribe',
      created_at INTEGER NOT NULL
    );
  `);
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      const statement = sqlite.prepare(sql);
      const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
      return { rows: objectRows.map((row) => Object.values(row)) };
    },
    { schema },
  );
  return db as unknown as Db;
}

function buildCaptureApp(db: Db) {
  return createLoopLibraryRoutes({ ctx: { db, auth: {} as unknown as Auth } });
}

function req(app: ReturnType<typeof buildCaptureApp>, path: string, body?: unknown, method = "POST") {
  return app.request(
    path,
    { method: body === undefined ? "GET" : method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined },
    ENV,
  );
}

const LEAD = {
  firstName: "Ada",
  workEmail: "Ada@Example.com",
  businessName: "Ada Inspections",
  trade: "Home inspection",
  software: "Spectora",
  volume: "11 to 30",
};

beforeEach(() => {
  captureEmails();
});

describe("loop library capture", () => {
  it("stores the lead, schedules five steps, and sends Day 0 inline", async () => {
    const db = testDb();
    const outbox = captureEmails();
    const app = buildCaptureApp(db);
    const res = await req(app, "/api/loop-library", LEAD);
    expect(res.status).toBe(200);
    const lead = await findLoopLeadByEmail(db, "ada@example.com");
    expect(lead).toMatchObject({ firstName: "Ada", trade: "Home inspection" });
    expect((await listMarketingSendsForLead(db, lead!.id))).toHaveLength(5);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.subject).toContain("Loop Library is ready");
    expect(outbox[0]?.html).toContain("unsubscribe?token=");
  });

  it("resubmits idempotently: no duplicate steps, no second Day 0", async () => {
    const db = testDb();
    const outbox = captureEmails();
    const app = buildCaptureApp(db);
    expect((await req(app, "/api/loop-library", LEAD)).status).toBe(200);
    expect((await req(app, "/api/loop-library", LEAD)).status).toBe(200);
    const lead = await findLoopLeadByEmail(db, "ada@example.com");
    expect((await listMarketingSendsForLead(db, lead!.id))).toHaveLength(5);
    expect(outbox).toHaveLength(1);
  });

  it("rejects invalid payloads and swallows honeypot bots", async () => {
    const db = testDb();
    const app = buildCaptureApp(db);
    expect((await req(app, "/api/loop-library", { ...LEAD, workEmail: "bad" })).status).toBe(422);
    expect((await req(app, "/api/loop-library", { ...LEAD, trade: "Wizardry" })).status).toBe(422);
    const honeypot = await req(app, "/api/loop-library", { ...LEAD, website: "https://spam.example" });
    expect(honeypot.status).toBe(200);
    expect(await findLoopLeadByEmail(db, "ada@example.com")).toBeNull();
  });

  it("gates library access on a valid token", async () => {
    const db = testDb();
    const app = buildCaptureApp(db);
    await req(app, "/api/loop-library", LEAD);
    const lead = await findLoopLeadByEmail(db, "ada@example.com");
    const token = await signLeadId(SECRET, lead!.id);
    const ok = await req(app, `/api/loop-library/access?token=${encodeURIComponent(token)}`, undefined, "GET");
    expect(ok.status).toBe(200);
    expect((await req(app, "/api/loop-library/access?token=bogus", undefined, "GET")).status).toBe(401);
    expect(await verifyLeadToken(SECRET, "bogus")).toBeNull();
    expect(await verifyLeadToken("wrong", token)).toBeNull();
  });

  it("unsubscribes and suppresses future sends", async () => {
    const db = testDb();
    const app = buildCaptureApp(db);
    await req(app, "/api/loop-library", LEAD);
    const lead = await findLoopLeadByEmail(db, "ada@example.com");
    const token = await signLeadId(SECRET, lead!.id);
    const res = await req(app, "/api/marketing/unsubscribe", { token });
    expect(res.status).toBe(200);
    const after = await findLoopLeadByEmail(db, "ada@example.com");
    expect(after?.unsubscribedAt).not.toBeNull();
  });
});

describe("marketing runner", () => {
  it("sends only due steps and never repeats", async () => {
    const db = testDb();
    const outbox = captureEmails();
    const app = buildCaptureApp(db);
    const t0 = Date.now();
    await req(app, "/api/loop-library", LEAD);
    // Day 0 went out inline; nothing else is due yet.
    const r0 = await runDueMarketing(db, ENV, t0);
    expect(r0.sent).toBe(0);
    // Day 2 becomes due.
    const r2 = await runDueMarketing(db, ENV, t0 + 2 * 86400 * 1000 + 1000);
    expect(r2.sent).toBe(1);
    expect(outbox).toHaveLength(2);
    expect(outbox[1]?.subject).toContain("not a booked job");
    // Repeat run sends nothing.
    const r2b = await runDueMarketing(db, ENV, t0 + 2 * 86400 * 1000 + 2000);
    expect(r2b.sent).toBe(0);
    // Day 5, 8, 12 each send once.
    expect((await runDueMarketing(db, ENV, t0 + 5 * 86400 * 1000 + 1000)).sent).toBe(1);
    expect((await runDueMarketing(db, ENV, t0 + 12 * 86400 * 1000 + 1000)).sent).toBe(2);
    expect(outbox).toHaveLength(5);
  });

  it("skips unsubscribed leads without sending", async () => {
    const db = testDb();
    const outbox = captureEmails();
    const app = buildCaptureApp(db);
    await req(app, "/api/loop-library", LEAD);
    const lead = await findLoopLeadByEmail(db, "ada@example.com");
    const token = await signLeadId(SECRET, lead!.id);
    await req(app, "/api/marketing/unsubscribe", { token });
    const outboxBefore = outbox.length;
    const summary = await runDueMarketing(db, ENV, Date.now() + 30 * 86400 * 1000);
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(outbox).toHaveLength(outboxBefore);
  });

  it("due-date math matches the welcome offsets", () => {
    const anchor = 1_700_000_000_000;
    expect(stepsFor(WELCOME_SEQUENCE, anchor).map((s) => s.step)).toEqual(["day0", "day2", "day5", "day8", "day12"]);
    expect(stepsFor(WELCOME_SEQUENCE, anchor)[2]!.dueAt).toBe(anchor + 5 * 86400 * 1000);
  });
});

describe("superadmin buyer reminders", () => {
  function buildAdminApp(db: Db) {
    const memberStore: MemberStore = {
      getMember: async () => null,
      isSuperadmin: async () => true,
      seedSuperadmins: async () => undefined,
    };
    const store = memoryStore();
    const fakeGateway = {
      createCustomer: async () => "cus",
      createPaymentSession: async () => "t",
      createClientAuthToken: async () => "t",
      chargeSavedCard: async () => ({ tracker: "t", chargeId: "c" }),
      listWallet: async () => [],
      checkTrackerStatus: async () => "succeeded" as const,
      refund: async () => ({ gatewayReference: "g" }),
    } as unknown as Gateway;
    return createSuperadminRoutes({
      session: async () => BOSS,
      store: memberStore,
      ctx: { db, auth: {} as unknown as Auth },
      billing: store,
      gateway: fakeGateway,
      idem: store,
    });
  }

  function adminReq(app: ReturnType<typeof buildAdminApp>, path: string, body?: unknown, method?: string) {
    return app.request(
      path,
      { method: body === undefined ? (method ?? "GET") : (method ?? "POST"), headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined },
      ENV,
    );
  }

  it("schedules diagnostic credit reminders from an anchor date", async () => {
    const db = testDb();
    const app = buildAdminApp(db);
    const res = await adminReq(app, "/api/superadmin/buyer-reminders", {
      email: "buyer@example.com",
      kind: "diagnostic",
      anchorDate: "2026-11-01",
    });
    expect(res.status).toBe(201);
    const anchor = Date.parse("2026-11-01");
    const { claimDueMarketingSends } = await import("../src/server/repositories/marketing");
    // Nothing due before day 7.
    expect(await claimDueMarketingSends(db, anchor + 6 * 86400 * 1000)).toHaveLength(0);
    // Day 7 fires the first reminder.
    const due = await claimDueMarketingSends(db, anchor + 7 * 86400 * 1000 + 1000);
    expect(due.map((r) => r.stepKey).sort()).toEqual(["diag-d7"]);
    expect((await adminReq(app, "/api/superadmin/buyer-reminders", { email: "bad", kind: "diagnostic", anchorDate: "2026-11-01" })).status).toBe(422);
  });

  it("403s non-superadmins and validates input", async () => {
    const db = testDb();
    const memberStore: MemberStore = {
      getMember: async () => null,
      isSuperadmin: async () => false,
      seedSuperadmins: async () => undefined,
    };
    const store = memoryStore();
    const app = createSuperadminRoutes({
      session: async () => BOSS,
      store: memberStore,
      ctx: { db, auth: {} as unknown as Auth },
      billing: store,
      gateway: {
        createCustomer: async () => "cus",
        createPaymentSession: async () => "t",
        createClientAuthToken: async () => "t",
        chargeSavedCard: async () => ({ tracker: "t", chargeId: "c" }),
        listWallet: async () => [],
        checkTrackerStatus: async () => "succeeded" as const,
        refund: async () => ({ gatewayReference: "g" }),
      } as unknown as Gateway,
      idem: store,
    });
    expect((await adminReq(app, "/api/superadmin/buyer-reminders", { email: "x@y.com", kind: "diagnostic", anchorDate: "2026-11-01" })).status).toBe(403);
    expect((await adminReq(app, "/api/superadmin/loop-leads")).status).toBe(403);
  });
});
