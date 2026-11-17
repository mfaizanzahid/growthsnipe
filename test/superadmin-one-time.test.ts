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
import { getOneTimeInvoiceByOrderId } from "../src/server/repositories/billing";

const BOSS: SessionUser = { id: "u9", email: "boss@test.com", emailVerified: true };
const NOW = 1_800_000_000_000;
const ORDER_ID = "order-one-time-1";

const ENV = {
  BETTER_AUTH_SECRET: "test-auth-secret",
  APP_BASE_URL: "https://growthsnipe.test",
  RESEND_FROM_EMAIL: "GrowthSnipe <test@example.com>",
  RESEND_API_KEY: "re_test",
} as unknown as Env;

function testDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE one_time_products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    INSERT INTO one_time_products (id, slug, name, amount_minor, currency, active, created_at)
    VALUES
      ('otp_blueprint', 'blueprint', 'SNIPE Blueprint', 99900, 'USD', 1, 1000),
      ('otp_loops', 'loops', 'SNIPE Loops', 9900, 'USD', 1, 1000);

    CREATE TABLE one_time_orders (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      business_name TEXT,
      trade TEXT,
      website TEXT,
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
      document_sent_at INTEGER,
      welcome_scheduled_at INTEGER,
      baseline_run_id TEXT,
      baseline_email_sent_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      paid_at INTEGER
    );

    CREATE TABLE one_time_invoices (
      id TEXT PRIMARY KEY,
      one_time_order_id TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'paid',
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      description TEXT,
      customer_email TEXT NOT NULL,
      customer_name TEXT,
      business_name TEXT,
      items_json TEXT NOT NULL,
      tracker TEXT,
      charge_id TEXT,
      paid_at INTEGER,
      email_sent_at INTEGER,
      email_resend_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE invoice_sequences (
      year INTEGER PRIMARY KEY,
      last_number INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE app_logs (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      surface TEXT NOT NULL,
      message TEXT NOT NULL,
      path TEXT,
      method TEXT,
      status_code INTEGER,
      user_id TEXT,
      user_email TEXT,
      org_id TEXT,
      org_name TEXT,
      ip TEXT,
      user_agent TEXT,
      request_id TEXT,
      detail_json TEXT,
      city TEXT,
      country TEXT
    );

    INSERT INTO one_time_orders (
      id, product_id, email, name, business_name, trade, website, amount_minor,
      currency, status, idempotency_key, receipt_sent_at, created_at, updated_at, paid_at
    ) VALUES (
      '${ORDER_ID}', 'otp_blueprint', 'buyer@example.com', 'Ada Buyer',
      'Acme Inspections', 'Home inspection', 'https://acme.example', 99900,
      'USD', 'paid', 'one-time-order-idem', ${NOW}, ${NOW}, ${NOW}, ${NOW}
    );
  `);
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

describe("superadmin one-time orders", () => {
  it("backfills a paid order invoice without emailing the buyer", async () => {
    const db = testDb();
    const outbox = captureEmails();
    const res = await call(buildApp(db), "/api/superadmin/one-time-orders");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      orders: Array<{
        id: string;
        productName: string | null;
        invoice: { number: string; amountMinor: number; emailSentAt: number | null } | null;
      }>;
    };
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toMatchObject({
      id: ORDER_ID,
      productName: "SNIPE Blueprint",
      invoice: { amountMinor: 99900, emailSentAt: null },
    });
    expect(body.orders[0]?.invoice?.number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(outbox).toHaveLength(0);

    const invoice = await getOneTimeInvoiceByOrderId(db, ORDER_ID);
    expect(invoice?.number).toBe(body.orders[0]?.invoice?.number);
  });

  it("resends the invoice to the buyer and records the resend", async () => {
    const db = testDb();
    await call(buildApp(db), "/api/superadmin/one-time-orders");
    const outbox = captureEmails();
    const res = await call(
      buildApp(db),
      `/api/superadmin/one-time-orders/${ORDER_ID}/resend-invoice`,
      "POST",
    );
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("buyer@example.com");
    expect(outbox[0]?.subject).toContain("Invoice");
    expect(outbox[0]?.html).toContain("/api/one-time/invoices/");
    const invoice = await getOneTimeInvoiceByOrderId(db, ORDER_ID);
    expect(invoice?.emailSentAt).toBeTruthy();
    expect(invoice?.emailResendCount).toBe(1);
  });

  it("resends the Loops playbook and rejects products without a document", async () => {
    const db = testDb();
    await db.insert(schema.oneTimeOrders).values({
      id: "order-loops-1",
      productId: "otp_loops",
      email: "loops@example.com",
      name: "Ada Buyer",
      firstName: "Ada",
      lastName: "Buyer",
      businessName: "Acme Inspections",
      trade: "Home inspection",
      amountMinor: 0,
      currency: "USD",
      status: "paid",
      idempotencyKey: "loops-order-idem",
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: NOW,
    });
    const outbox = captureEmails();
    const res = await call(
      buildApp(db),
      "/api/superadmin/one-time-orders/order-loops-1/resend-document",
      "POST",
    );
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("loops@example.com");
    expect(outbox[0]?.subject).toContain("playbook");
    expect(outbox[0]?.html).toContain("/api/one-time/loops/");

    const wrongProduct = await call(
      buildApp(db),
      `/api/superadmin/one-time-orders/${ORDER_ID}/resend-document`,
      "POST",
    );
    expect(wrongProduct.status).toBe(422);
  });

  it("downloads the guest invoice PDF", async () => {
    const db = testDb();
    await call(buildApp(db), "/api/superadmin/one-time-orders");
    const res = await call(buildApp(db), `/api/superadmin/one-time-orders/${ORDER_ID}/invoice`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("blocks non-superadmins", async () => {
    const res = await call(buildApp(testDb(), false), "/api/superadmin/one-time-orders");
    expect(res.status).toBe(403);
  });
});
