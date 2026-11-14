import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";
import type { Auth } from "../src/server/auth";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import { captureEmails } from "../src/server/lib/email";
import { createSuperadminRoutes } from "../src/server/routes/superadmin";
import { getRunById } from "../src/server/diagnostic/store";

const BOSS: SessionUser = { id: "u9", email: "boss@test.com", emailVerified: true };
const NOW = 1_800_000_000_000;
const RUN_ID = "run-report-1";
const ORDER_ID = "order-report-1";

const ENV = {
  BETTER_AUTH_SECRET: "test-auth-secret",
  APP_BASE_URL: "https://growthsnipe.test",
  RESEND_FROM_EMAIL: "GrowthSnipe <test@example.com>",
  RESEND_API_KEY: "re_test",
} as unknown as Env;

function testDb(includeSyncing = false): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE one_time_orders (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      business_name TEXT,
      trade TEXT,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending',
      tracker TEXT UNIQUE,
      charge_id TEXT,
      idempotency_key TEXT UNIQUE NOT NULL,
      coupon_id TEXT,
      coupon_code TEXT,
      discount_minor INTEGER NOT NULL DEFAULT 0,
      coupon_redeemed_at INTEGER,
      receipt_sent_at INTEGER,
      intake_sent_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE TABLE diagnostic_runs (
      id TEXT PRIMARY KEY,
      one_time_order_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      provider TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_connection',
      stage TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      window_from TEXT,
      window_to TEXT,
      facts_json TEXT,
      narrative_json TEXT,
      connect_email_sent_at INTEGER,
      report_email_sent_at INTEGER,
      report_email_resent_at INTEGER,
      report_email_resend_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ready_at INTEGER
    );
    CREATE TABLE diagnostic_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL,
      percent_off INTEGER,
      amount_off_minor INTEGER,
      currency TEXT NOT NULL DEFAULT 'USD',
      duration TEXT NOT NULL DEFAULT 'once',
      duration_cycles INTEGER,
      applies_to_setup INTEGER NOT NULL DEFAULT 0,
      max_redemptions INTEGER,
      redeemed_count INTEGER NOT NULL DEFAULT 0,
      valid_from INTEGER,
      valid_until INTEGER,
      restricted_email TEXT,
      one_time_product_slug TEXT,
      source_order_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX coupons_source_order_idx ON coupons (source_order_id)
      WHERE source_order_id IS NOT NULL;
    CREATE TABLE coupon_plans (
      coupon_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      UNIQUE(coupon_id, plan_id)
    );

    INSERT INTO one_time_orders (
      id, product_id, email, name, business_name, trade, amount_minor, currency,
      status, idempotency_key, created_at, updated_at, paid_at
    ) VALUES (
      '${ORDER_ID}', 'otp_diagnostic', 'buyer@example.com', 'Ada Buyer',
      'Acme Inspections', 'Home inspection', 19900, 'USD', 'paid',
      'order-report-idem', ${NOW}, ${NOW}, ${NOW}
    );
    INSERT INTO diagnostic_runs (
      id, one_time_order_id, email, provider, status, stage, progress,
      created_at, updated_at, ready_at
    ) VALUES (
      '${RUN_ID}', '${ORDER_ID}', 'buyer@example.com', 'isn', 'ready', 'ready',
      100, ${NOW}, ${NOW}, ${NOW}
    );
  `);
  if (includeSyncing) {
    sqlite.exec(`
      INSERT INTO diagnostic_runs (
        id, one_time_order_id, email, provider, status, stage, progress,
        created_at, updated_at
      ) VALUES (
        'run-syncing', 'order-syncing', 'buyer2@example.com', 'isn', 'syncing',
        'collecting', 50, ${NOW}, ${NOW}
      );
    `);
  }
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      const statement = sqlite.prepare(sql);
      const rows = statement.all(...(params as never[])) as Record<string, unknown>[];
      return { rows: rows.map((row) => Object.values(row)) };
    },
    { schema },
  );
  return db as unknown as Db;
}

function buildApp(db: Db, superadmin = true) {
  const memberStore: MemberStore = {
    getMember: async () => null,
    isSuperadmin: async () => superadmin,
    seedSuperadmins: async () => undefined,
  };
  return createSuperadminRoutes({
    session: async () => BOSS,
    store: memberStore,
    ctx: { db, auth: {} as unknown as Auth },
  });
}

function call(app: ReturnType<typeof buildApp>, path: string, method = "GET", body?: unknown) {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    ENV,
  );
}

beforeEach(() => {
  captureEmails();
});

describe("superadmin diagnostic reports", () => {
  it("lists generated reports with the business name", async () => {
    const res = await call(buildApp(testDb()), "/api/superadmin/diagnostic-reports");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reports: Array<Record<string, unknown>>;
    };
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0]).toMatchObject({
      id: RUN_ID,
      orderId: ORDER_ID,
      email: "buyer@example.com",
      businessName: "Acme Inspections",
      status: "ready",
      progress: 100,
      reportEmailResendCount: 0,
    });
  });

  it("resends a fresh report link and records the resend", async () => {
    const db = testDb();
    const outbox = captureEmails();
    const res = await call(
      buildApp(db),
      `/api/superadmin/diagnostic-reports/${RUN_ID}/resend`,
      "POST",
    );
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("buyer@example.com");
    expect(outbox[0]?.subject).toContain("SNIPE Diagnostic");
    expect(outbox[0]?.html).toContain("https://growthsnipe.test/api/diagnostic/report?token=");
    expect(outbox[0]?.html).toContain("30-minute review");

    const run = await getRunById(db, RUN_ID);
    expect(run?.reportEmailResentAt).toBeTruthy();
    expect(run?.reportEmailResendCount).toBe(1);
    expect(run?.reportEmailSentAt).toBeNull();
  });

  it("rejects a report download before the run is ready", async () => {
    const res = await call(
      buildApp(testDb(true)),
      "/api/superadmin/diagnostic-reports/run-syncing/report",
    );
    expect(res.status).toBe(409);
  });

  it("blocks non-superadmins", async () => {
    const res = await call(buildApp(testDb(), false), "/api/superadmin/diagnostic-reports");
    expect(res.status).toBe(403);
  });
});
