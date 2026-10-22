import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import { hmacSha512, toHex } from "../src/server/lib/crypto";
import { captureEmails } from "../src/server/lib/email";
import { memoryStore, setStoreClock } from "./memory-store";
import { handleSafepayWebhook } from "../src/server/billing/webhooks";
import { createWebhookRoutes } from "../src/server/routes/webhooks";

const SECRET = "wh_shared_secret";
const ENV = {
  SAFEPAY_WEBHOOK_SECRET: SECRET,
  RESEND_API_KEY: "re_test",
} as unknown as Env;

const NOW = 2_000_000_000;

async function sign(body: string): Promise<string> {
  const digest = await hmacSha512(SECRET, new TextEncoder().encode(body));
  return toHex(digest);
}

function envelope(token: string, type: string, data: Record<string, unknown>): string {
  return JSON.stringify({ token, version: "2.0.0", type, data });
}

beforeEach(() => {
  captureEmails();
  setStoreClock(NOW * 1000);
});

describe("webhook authenticity + dedupe", () => {
  it("401s on bad signatures and acks unparseable bodies", async () => {
    const store = memoryStore();
    const body = envelope("evt_1", "payment.succeeded", { tracker: "track_x" });
    expect((await handleSafepayWebhook(ENV, store, body, "deadbeef")).httpStatus).toBe(401);
    expect((await handleSafepayWebhook(ENV, store, body, null)).httpStatus).toBe(401);
    const ok = await handleSafepayWebhook(ENV, store, body, await sign(body));
    expect(ok.httpStatus).toBe(200);
    const dup = await handleSafepayWebhook(ENV, store, body, await sign(body));
    expect(dup).toMatchObject({ httpStatus: 200, ack: "duplicate" });
    const bad = await handleSafepayWebhook(ENV, store, "not-json", await sign("not-json"));
    expect(bad.ack).toBe("unparseable");
  });

  it("ignores unknown event types after recording", async () => {
    const store = memoryStore();
    const body = envelope("evt_2", "subscription.payment.succeeded", { id: "sub_x" });
    const out = await handleSafepayWebhook(ENV, store, body, await sign(body));
    expect(out).toMatchObject({ httpStatus: 200, ack: "ignored" });
  });
});

describe("webhook reconciliation", () => {
  it("confirms late payments without touching paid invoices", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", status: "past_due", pastDueSince: NOW - 100 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900, tracker: "track_late" },
      [{ description: "x", amountMinor: 19900 }],
      NOW - 100,
    );
    const outbox = captureEmails();
    const body = envelope("evt_3", "payment.succeeded", { tracker: "track_late", amount: 19900, currency: "USD" });
    const out = await handleSafepayWebhook(ENV, store, body, await sign(body));
    expect(out.ack).toBe("reconciled");
    expect((await store.getInvoice("inv1"))?.status).toBe("paid");
    expect((await store.getSubscription("s1"))?.status).toBe("active");
    expect(outbox.length).toBeGreaterThan(0);

    // Replay with a new token never downgrades.
    const body2 = envelope("evt_4", "payment.failed", { tracker: "track_late" });
    await handleSafepayWebhook(ENV, store, body2, await sign(body2));
    expect((await store.getInvoice("inv1"))?.status).toBe("paid");
  });

  it("fails due invoices and starts dunning on payment.failed", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", status: "active", nextCharge: NOW + 100 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "due", amountMinor: 19900, tracker: "track_f" },
      [{ description: "x", amountMinor: 19900 }],
      NOW - 100,
    );
    const body = envelope("evt_5", "payment.failed", { tracker: "track_f" });
    await handleSafepayWebhook(ENV, store, body, await sign(body));
    expect((await store.getInvoice("inv1"))?.status).toBe("failed");
    expect((await store.getInvoice("inv1"))?.reminderCount).toBe(1);
    expect((await store.getSubscription("s1"))?.status).toBe("past_due");
  });

  it("records dashboard-initiated refunds idempotently", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", type: "usage", status: "paid", amountMinor: 5000, tracker: "track_r" },
      [{ description: "x", amountMinor: 5000 }],
      NOW - 100,
    );
    const body = envelope("evt_6", "payment.refunded", { tracker: "track_r", refund_amount: 5000, currency: "USD" });
    await handleSafepayWebhook(ENV, store, body, await sign(body));
    expect((await store.getInvoice("inv1"))?.status).toBe("refunded");
    // Same refund payload, new token: no duplicate transaction.
    const body2 = envelope("evt_7", "payment.refunded", { tracker: "track_r", refund_amount: 5000, currency: "USD" });
    await handleSafepayWebhook(ENV, store, body2, await sign(body2));
    const txns = await store.listTransactionsByTracker("track_r");
    expect(txns.filter((t) => t.kind === "refund")).toHaveLength(1);
  });
});

describe("webhook route", () => {
  it("returns 401 without a valid signature", async () => {
    const store = memoryStore();
    const app = createWebhookRoutes({ billing: store });
    const res = await app.request(
      "/webhooks/safepay",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      ENV,
    );
    expect(res.status).toBe(401);
  });
});
