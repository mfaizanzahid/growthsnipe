import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";
import type { Auth } from "../src/server/auth";
import type { Gateway } from "../src/server/billing/gateway";
import { captureEmails } from "../src/server/lib/email";
import { hmacSha512, toHex } from "../src/server/lib/crypto";
import { memoryStore } from "./memory-store";
import { createOneTimeRoutes } from "../src/server/routes/one-time";
import { completeOneTimePaidOrder, confirmOneTimeOrder, failOneTimeOrder } from "../src/server/billing/one-time";
import { handleSafepayWebhook } from "../src/server/billing/webhooks";
import { findOneTimeOrderByTracker, getOneTimeOrder } from "../src/server/repositories/billing";

const SECRET = "wh_shared_secret";
const ENV = {
  SAFEPAY_PUBLIC_KEY: "pk_test",
  SAFEPAY_SECRET_KEY: "sk_test",
  SAFEPAY_API_BASE: "https://sandbox.api.getsafepay.com",
  SAFEPAY_ENV: "sandbox",
  SAFEPAY_WEBHOOK_SECRET: SECRET,
  SAFEPAY_DEFAULT_COUNTRY: "US",
  RESEND_API_KEY: "re_test",
  APP_BASE_URL: "https://growthsnipe.test",
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
      ('otp_diagnostic', 'diagnostic', 'SNIPE Diagnostic', 19900, 'USD', 1, 1000),
      ('otp_blueprint', 'blueprint', 'SNIPE Blueprint', 99900, 'USD', 1, 1000);
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
      receipt_sent_at INTEGER,
      intake_sent_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      paid_at INTEGER
    );
    CREATE INDEX one_time_orders_email_idx ON one_time_orders (email);
    CREATE INDEX one_time_orders_status_idx ON one_time_orders (status);
    CREATE INDEX one_time_orders_tracker_idx ON one_time_orders (tracker);
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

function fakeGateway(status: "succeeded" | "failed" | "pending" = "succeeded"): Gateway & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createCustomer: async () => "cus_test",
    createPaymentSession: async () => {
      calls.push("session");
      return `track_${calls.length}`;
    },
    createClientAuthToken: async () => "tbt_test",
    chargeSavedCard: async () => ({ tracker: "track_c", chargeId: "ch_c" }),
    listWallet: async () => [],
    checkTrackerStatus: async () => status,
    refund: async () => ({ gatewayReference: "track_x" }),
  };
}

function buildApp(db: Db, gateway: Gateway) {
  return createOneTimeRoutes({
    gateway,
    ctx: { db, auth: {} as unknown as Auth },
  });
}

function req(app: ReturnType<typeof buildApp>, path: string, body?: unknown) {
  return app.request(
    path,
    { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined },
    ENV,
  );
}

const BUYER = {
  slug: "diagnostic",
  email: "Owner@Example.com",
  name: "Ada Owner",
  phone: "+15551234567",
  country: "US",
  businessName: "Ada Inspections",
};

beforeEach(() => {
  captureEmails();
});

describe("one-time products + session", () => {
  it("lists the two active products with server-computed amounts", async () => {
    const app = buildApp(testDb(), fakeGateway());
    const res = await req(app, "/api/one-time/products");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      products: [
        { slug: "diagnostic", name: "SNIPE Diagnostic", amountMinor: 19900, currency: "USD" },
        { slug: "blueprint", name: "SNIPE Blueprint", amountMinor: 99900, currency: "USD" },
      ],
    });
  });

  it("validates input and computes the amount server-side", async () => {
    const app = buildApp(testDb(), fakeGateway());
    expect((await req(app, "/api/one-time/session", { ...BUYER, slug: "nope" })).status).toBe(422);
    expect((await req(app, "/api/one-time/session", { ...BUYER, email: "bad" })).status).toBe(422);
    expect((await req(app, "/api/one-time/session", { ...BUYER, phone: "12" })).status).toBe(422);
    const res = await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-01" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; tracker: string; amountMinor: number };
    expect(body.amountMinor).toBe(19900);
    expect(body.tracker).toBe("track_1");
  });

  it("reuses the order for a repeated idempotency key", async () => {
    const db = testDb();
    const gateway = fakeGateway();
    const app = buildApp(db, gateway);
    const first = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-09" })).json()) as { orderId: string };
    const second = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-09" })).json()) as { orderId: string; cached: boolean };
    expect(second.orderId).toBe(first.orderId);
    expect(second.cached).toBe(true);
  });
});

describe("one-time confirm", () => {
  it("pays, receipts, and intakes exactly once, then replays idempotently", async () => {
    const db = testDb();
    const app = buildApp(db, fakeGateway("succeeded"));
    const outbox = captureEmails();
    const session = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-02" })).json()) as {
      orderId: string;
      tracker: string;
    };
    const first = await req(app, "/api/one-time/confirm", { orderId: session.orderId, tracker: session.tracker });
    expect(first.status).toBe(200);
    expect((await getOneTimeOrder(db, session.orderId))?.status).toBe("paid");
    expect(outbox).toHaveLength(2);
    expect(outbox[0]?.subject).toContain("SNIPE Diagnostic");
    expect(outbox[1]?.subject).toContain("Diagnostic is underway");

    const again = await req(app, "/api/one-time/confirm", { orderId: session.orderId, tracker: session.tracker });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { cached: boolean }).cached).toBe(true);
    expect(outbox).toHaveLength(2);
  });

  it("rejects tracker mismatch and pending payments", async () => {
    const db = testDb();
    const app = buildApp(db, fakeGateway("succeeded"));
    const session = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-03" })).json()) as {
      orderId: string;
    };
    expect((await req(app, "/api/one-time/confirm", { orderId: session.orderId, tracker: "track_other" })).status).toBe(422);

    const pendingApp = buildApp(testDb(), fakeGateway("pending"));
    const pendingSession = (await (
      await req(pendingApp, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-04" })
    ).json()) as { orderId: string; tracker: string };
    expect((await req(pendingApp, "/api/one-time/confirm", { orderId: pendingSession.orderId, tracker: pendingSession.tracker })).status).toBe(402);
  });

  it("marks failed trackers failed", async () => {
    const db = testDb();
    const gateway = fakeGateway("failed");
    const app = buildApp(db, gateway);
    const session = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-05" })).json()) as {
      orderId: string;
      tracker: string;
    };
    expect((await req(app, "/api/one-time/confirm", { orderId: session.orderId, tracker: session.tracker })).status).toBe(402);
    expect((await getOneTimeOrder(db, session.orderId))?.status).toBe("failed");
  });
});

describe("one-time webhook reconcile", () => {
  async function sign(body: string) {
    return toHex(await hmacSha512(SECRET, new TextEncoder().encode(body)));
  }
  function envelope(token: string, type: string, data: Record<string, unknown>) {
    return JSON.stringify({ token, version: "2.0.0", type, data });
  }
  function oneTimeAdapter(db: Db) {
    return {
      findByTracker: async (tracker: string) => {
        const order = await findOneTimeOrderByTracker(db, tracker);
        return order ? { id: order.id, status: order.status } : null;
      },
      completePaid: async (orderId: string, chargeId: string) => {
        const { transitioned } = await completeOneTimePaidOrder(db, ENV, orderId, chargeId);
        return { transitioned };
      },
      markFailed: (orderId: string) => failOneTimeOrder(db, orderId),
    };
  }

  it("pays pending orders on payment.succeeded and ignores repeats", async () => {
    const db = testDb();
    const store = memoryStore();
    const outbox = captureEmails();
    const gateway = fakeGateway("succeeded");
    const app = buildApp(db, gateway);
    const session = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-06" })).json()) as {
      orderId: string;
      tracker: string;
    };
    const body = envelope("evt_1", "payment.succeeded", { tracker: session.tracker, charge: "ch_9" });
    const out = await handleSafepayWebhook(ENV, store, body, await sign(body), undefined, oneTimeAdapter(db));
    expect(out.ack).toBe("reconciled");
    expect((await getOneTimeOrder(db, session.orderId))?.status).toBe("paid");
    expect(outbox).toHaveLength(2);

    const dupBody = envelope("evt_1", "payment.succeeded", { tracker: session.tracker });
    expect((await handleSafepayWebhook(ENV, store, dupBody, await sign(dupBody), undefined, oneTimeAdapter(db))).ack).toBe("duplicate");
    expect(outbox).toHaveLength(2);
  });

  it("fails pending orders on payment.failed and 401s bad signatures", async () => {
    const db = testDb();
    const store = memoryStore();
    const gateway = fakeGateway("pending");
    const app = buildApp(db, gateway);
    const session = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-07" })).json()) as {
      orderId: string;
      tracker: string;
    };
    const body = envelope("evt_2", "payment.failed", { tracker: session.tracker });
    expect(await handleSafepayWebhook(ENV, store, body, "deadbeef", undefined, oneTimeAdapter(db))).toEqual({
      httpStatus: 401,
      ack: "unauthorized",
    });
    const out = await handleSafepayWebhook(ENV, store, body, await sign(body), undefined, oneTimeAdapter(db));
    expect(out.ack).toBe("reconciled");
    expect((await getOneTimeOrder(db, session.orderId))?.status).toBe("failed");
  });

  it("leaves paid orders untouched", async () => {
    const db = testDb();
    const store = memoryStore();
    const gateway = fakeGateway("succeeded");
    const app = buildApp(db, gateway);
    const session = (await (await req(app, "/api/one-time/session", { ...BUYER, idempotencyKey: "idem-key-08" })).json()) as {
      orderId: string;
      tracker: string;
    };
    await confirmOneTimeOrder(db, ENV, gateway, { orderId: session.orderId, tracker: session.tracker });
    const body = envelope("evt_3", "payment.succeeded", { tracker: session.tracker });
    await handleSafepayWebhook(ENV, store, body, await sign(body), undefined, oneTimeAdapter(db));
    expect((await getOneTimeOrder(db, session.orderId))?.status).toBe("paid");
  });
});
