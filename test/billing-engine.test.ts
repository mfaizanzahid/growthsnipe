import { beforeEach, describe, expect, it } from "vitest";
import type { Env, WalletPaymentMethod } from "../src/server/types";
import { encryptSecret } from "../src/server/lib/crypto";
import { advanceBillingDate } from "../src/server/lib/billing-dates";
import { captureEmails } from "../src/server/lib/email";
import { memoryStore, setStoreClock } from "./memory-store";
import type { Gateway } from "../src/server/billing/gateway";
import { chargePeriod, processDueSubscriptions, processPastDueExpiry, sendDueReminders } from "../src/server/billing/renewals";
import { payInvoice } from "../src/server/billing/payments";
import { confirmSignup } from "../src/server/billing/signup";
import { changePlan, cancelSubscription } from "../src/server/billing/changes";
import { removeMethod, setPrimary } from "../src/server/billing/methods";
import { validateCoupon } from "../src/server/billing/coupons";
import { BillingError } from "../src/server/billing/errors";

const KEY = (() => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
})();
const ENV = {
  TOKEN_ENCRYPTION_KEY: KEY,
  SAFEPAY_PUBLIC_KEY: "pk_test",
  SAFEPAY_SECRET_KEY: "sk_test",
  SAFEPAY_API_BASE: "https://sandbox.api.getsafepay.com",
  RESEND_API_KEY: "re_test",
} as unknown as Env;

interface FakeOptions {
  failTokens?: string[];
  trackerStatus?: "succeeded" | "failed" | "pending";
  wallet?: WalletPaymentMethod[];
}

function fakeGateway(opts: FakeOptions = {}): Gateway & { calls: string[] } {
  const calls: string[] = [];
  const fail = new Set(opts.failTokens ?? []);
  return {
    calls,
    createCustomer: async () => "cus_test",
    createPaymentSession: async () => "track_test",
    createClientAuthToken: async () => "tbt_test",
    chargeSavedCard: async (input) => {
      calls.push(`charge:${input.paymentMethodToken}:${input.amountMinor}`);
      if (fail.has(input.paymentMethodToken)) throw new Error("card declined");
      return { tracker: `track_${calls.length}`, chargeId: `ch_${calls.length}` };
    },
    listWallet: async () => opts.wallet ?? [],
    checkTrackerStatus: async () => opts.trackerStatus ?? "succeeded",
    refund: async () => ({ gatewayReference: "track_x" }),
  };
}

async function enc(token: string): Promise<string> {
  return encryptSecret(token, KEY);
}

const NOW = 2_000_000_000;

beforeEach(() => {
  captureEmails();
  setStoreClock(NOW * 1000);
});

async function seedOrg(store: ReturnType<typeof memoryStore>, orgId = "o1") {
  store.seed.plan({ id: "launch", name: "Launch" });
  return orgId;
}

describe("renewal cascade", () => {
  it("collects a period exactly once under concurrent runs", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100 });

    const gw = fakeGateway();
    const results = await Promise.allSettled([
      chargePeriod(ENV, store, store, gw, "s1", { now: NOW }),
      chargePeriod(ENV, store, store, gw, "s1", { now: NOW }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe("paid");
  });

  it("charges the default method and advances the schedule", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, priority: -1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100, interval: "month" });

    const ok = await chargePeriod(ENV, store, store, fakeGateway(), "s1", { now: NOW });
    expect(ok).toBe(true);
    const sub = await store.getSubscription("s1");
    expect(sub?.status).toBe("active");
    expect(sub?.cyclesCharged).toBe(2);
    expect(sub?.nextCharge).toBeGreaterThan(NOW);
    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices[0]?.status).toBe("paid");
    expect(invoices[0]?.number).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("collects a prepaid trial's renewal on the trial-anchored date", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, priority: -1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    // A prepaid trial: the plan is paid for, and the renewal sits one interval
    // after the trial end (not after the day the customer subscribed).
    const trialEndsAt = NOW + 5 * 86400;
    store.seed.subscription({
      id: "s1",
      orgId: "o1",
      planId: "starter",
      status: "active",
      trialPrepaid: 1,
      trialEndsAt,
      cyclesCharged: 1,
      nextCharge: advanceBillingDate(trialEndsAt, "month", 1),
    });

    // Not due yet.
    expect(await chargePeriod(ENV, store, store, fakeGateway(), "s1", { now: NOW })).toBe(false);

    const renewalAt = advanceBillingDate(trialEndsAt, "month", 1);
    const ok = await chargePeriod(ENV, store, store, fakeGateway(), "s1", { now: renewalAt + 60 });
    expect(ok).toBe(true);
    const sub = await store.getSubscription("s1");
    expect(sub?.status).toBe("active");
    expect(sub?.cyclesCharged).toBe(2);
    // The schedule keeps the trial anchor: one interval after the previous date.
    expect(sub?.nextCharge).toBe(advanceBillingDate(renewalAt, "month", 1));
  });

  it("falls back to backup and auto-promotes the winner", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, priority: -1, safepayPaymentMethodTokenEncrypted: await enc("pm_bad") });
    store.seed.method({ id: "m2", orgId: "o1", isDefault: 0, priority: 0, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100 });

    const gw = fakeGateway({ failTokens: ["pm_bad"] });
    const ok = await chargePeriod(ENV, store, store, gw, "s1", { now: NOW });
    expect(ok).toBe(true);
    expect(gw.calls[0]).toContain("pm_bad");
    expect(gw.calls[1]).toContain("pm_good");
    expect((await store.getPaymentMethod("m1"))?.status).toBe("failed");
    expect((await store.getPaymentMethod("m2"))?.isDefault).toBe(1);
    expect((await store.getSubscription("s1"))?.defaultPaymentMethodId).toBe("m2");
  });

  it("marks all-fail as past_due with day-0 dunning", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_bad") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100 });

    const ok = await chargePeriod(ENV, store, store, fakeGateway({ failTokens: ["pm_bad"] }), "s1", { now: NOW });
    expect(ok).toBe(false);
    expect((await store.getPaymentMethod("m1"))?.status).toBe("failed");
    const sub = await store.getSubscription("s1");
    expect(sub?.status).toBe("past_due");
    expect(sub?.pastDueSince).toBe(NOW);
    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices[0]?.status).toBe("failed");
    expect(invoices[0]?.reminderCount).toBe(1);
  });

  it("reuses the same invoice across cron retries (no duplicates)", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_bad") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100 });

    const gw = fakeGateway({ failTokens: ["pm_bad"] });
    await processDueSubscriptions(ENV, store, store, gw, NOW);
    await processDueSubscriptions(ENV, store, store, gw, NOW + 86400);
    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices).toHaveLength(1);
  });
});

describe("auto-retry cap", () => {
  async function seedFailing(store: ReturnType<typeof memoryStore>) {
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_bad") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100 });
  }

  it("retries failed cards with a 24h gap and stops after 2 retries per card", async () => {
    const store = memoryStore();
    await seedFailing(store);
    const gw = fakeGateway({ failTokens: ["pm_bad"] });

    setStoreClock(NOW * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW })).toBe(false);
    expect(gw.calls).toHaveLength(1);
    expect((await store.getPaymentMethod("m1"))?.status).toBe("failed");

    // Same card within 24h: blocked, no new charge (failed cards re-enter
    // the cascade, so no fresh card is needed for a retry).
    setStoreClock((NOW + 3600) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 3600 })).toBe(false);
    expect(gw.calls).toHaveLength(1);

    // Day 1 and day 2 retries run against the same failed card.
    setStoreClock((NOW + 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(2);
    setStoreClock((NOW + 2 * 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 2 * 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(3);

    // Card budget spent (initial + 2 retries): day 3+ stays manual-only.
    setStoreClock((NOW + 3 * 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 3 * 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(3);
    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe("failed");

    // Manual pay with a good card still recovers.
    store.seed.method({ id: "m2", orgId: "o1", isDefault: 0, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    const { result } = await payInvoice(
      ENV, store, store, fakeGateway(), { orgId: "o1", invoiceId: invoices[0]!.id, paymentMethodId: "m2", recipientEmails: [] }, NOW + 3 * 86400,
    );
    expect(result.invoiceId).toBe(invoices[0]!.id);
    expect((await store.getSubscription("s1"))?.status).toBe("active");
    setStoreClock(NOW * 1000);
  });

  it("tracks the retry budget per card, not per invoice", async () => {
    const store = memoryStore();
    await seedFailing(store);
    const gw = fakeGateway({ failTokens: ["pm_bad", "pm_new"] });

    setStoreClock(NOW * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW })).toBe(false);
    expect(gw.calls).toHaveLength(1); // m1 attempt 1

    // A card added on day 1 gets its own budget: both cards tried day 1+2,
    // only the newer card tried day 3, neither on day 4.
    store.seed.method({ id: "m2", orgId: "o1", isDefault: 0, safepayPaymentMethodTokenEncrypted: await enc("pm_new") });
    setStoreClock((NOW + 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(3); // m1 attempt 2 + m2 attempt 1
    setStoreClock((NOW + 2 * 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 2 * 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(5); // m1 attempt 3 + m2 attempt 2
    setStoreClock((NOW + 3 * 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 3 * 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(6); // m2 attempt 3 only (m1 spent)
    setStoreClock((NOW + 4 * 86400) * 1000);
    expect(await chargePeriod(ENV, store, store, gw, "s1", { now: NOW + 4 * 86400 })).toBe(false);
    expect(gw.calls).toHaveLength(6); // both spent — manual only
    setStoreClock(NOW * 1000);
  });

  it("manual pay works with a failed-status card and reactivates it", async () => {
    const store = memoryStore();
    await seedFailing(store);
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, status: "failed", safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100, status: "past_due", pastDueSince: NOW - 100 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 100,
    );
    // Default selection lands on the failed primary and succeeds.
    const { result } = await payInvoice(
      ENV, store, store, fakeGateway(), { orgId: "o1", invoiceId: "inv1", recipientEmails: [] }, NOW,
    );
    expect(result.invoiceId).toBe("inv1");
    expect((await store.getPaymentMethod("m1"))?.status).toBe("active");
    expect((await store.getSubscription("s1"))?.status).toBe("active");
  });
});

describe("past-due endgame", () => {
  it("warns once at 20 days and auto-cancels at 25", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 30 * 86400, status: "past_due", pastDueSince: NOW - 20 * 86400 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 20 * 86400,
    );
    const outbox = captureEmails();
    expect(await processPastDueExpiry(ENV, store, NOW)).toEqual({ warned: 1, canceled: 0 });
    expect((await store.getInvoice("inv1"))?.reminderCount).toBe(6);
    // Second run the same day does not re-warn.
    expect(await processPastDueExpiry(ENV, store, NOW + 3600)).toEqual({ warned: 0, canceled: 0 });
    // Five days later the subscription cancels for non-payment.
    expect(await processPastDueExpiry(ENV, store, NOW + 5 * 86400)).toEqual({ warned: 0, canceled: 1 });
    expect((await store.getSubscription("s1"))?.status).toBe("canceled");
    expect(outbox.length).toBeGreaterThanOrEqual(3);
  });

  it("stays silent before day 20", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100, status: "past_due", pastDueSince: NOW - 19 * 86400 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 19 * 86400,
    );
    expect(await processPastDueExpiry(ENV, store, NOW)).toEqual({ warned: 0, canceled: 0 });
  });
});

describe("dunning reminders", () => {
  it("sends on schedule, stops after the final notice", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_bad") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100, status: "past_due", pastDueSince: NOW - 10 * 86400 });
    const inv = await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 10 * 86400,
    );
    // Day 2 after failure.
    await store.updateInvoice(inv.id, { reminderCount: 1, lastReminderAt: NOW - 2 * 86400 });
    expect(await sendDueReminders(ENV, store, NOW)).toBe(1);
    // Too soon for the next one.
    expect(await sendDueReminders(ENV, store, NOW + 3600)).toBe(0);
    // Exhausted schedule stays silent.
    await store.updateInvoice(inv.id, { reminderCount: 5, lastReminderAt: NOW - 30 * 86400 });
    expect(await sendDueReminders(ENV, store, NOW)).toBe(0);
  });

  it("skips invoices whose subscription recovered", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW + 100, status: "active" });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 5 * 86400,
    );
    await store.updateInvoice("inv1", { reminderCount: 1, lastReminderAt: NOW - 5 * 86400 });
    expect(await sendDueReminders(ENV, store, NOW)).toBe(0);
  });
});

describe("payInvoice", () => {
  it("pays a failed invoice and recovers past_due", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW - 100, status: "past_due", pastDueSince: NOW - 100 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 100,
    );
    const outbox = captureEmails();
    const { cached, result } = await payInvoice(
      ENV, store, store, fakeGateway(), { orgId: "o1", invoiceId: "inv1", recipientEmails: ["buyer@test.com"] }, NOW,
    );
    expect(cached).toBe(false);
    expect(result.chargeId).toMatch(/^ch_/);
    expect((await store.getInvoice("inv1"))?.status).toBe("paid");
    expect((await store.getSubscription("s1"))?.status).toBe("active");
    expect(outbox.length).toBeGreaterThan(0);
  });

  it("enforces cooldown and rejects paid invoices", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "x", amountMinor: 19900 }],
      NOW - 100,
    );
    await payInvoice(ENV, store, store, fakeGateway(), { orgId: "o1", invoiceId: "inv1", recipientEmails: [] }, NOW);
    await expect(
      payInvoice(ENV, store, store, fakeGateway(), { orgId: "o1", invoiceId: "inv1", recipientEmails: [] }, NOW + 60),
    ).rejects.toMatchObject({ status: 409 });
    // Fresh failed invoice, immediate second attempt hits cooldown.
    await store.createInvoice(
      { id: "inv2", orgId: "o1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "x", amountMinor: 19900 }],
      NOW,
    );
    await store.insertTransaction({ orgId: "o1", invoiceId: "inv2", kind: "manual_pay", status: "failed", amountMinor: 19900 });
    await expect(
      payInvoice(ENV, store, store, fakeGateway(), { orgId: "o1", invoiceId: "inv2", recipientEmails: [] }, NOW + 60),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe("signup confirm", () => {
  it("is idempotent and numbers the invoice", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "track_1", orgId: "o1", amountMinor: 19900 });
    const gw = fakeGateway({ wallet: [{ token: "pm_new", last4: "4242" }] });
    const input = {
      orgId: "o1",
      userId: "u1",
      planId: "launch",
      interval: "month" as const,
      tracker: "track_1",
      idempotencyKey: "key-1",
      recipientEmails: ["buyer@test.com"],
    };
    const first = await confirmSignup(ENV, store, store, gw, input, NOW);
    expect(first.cached).toBe(false);
    expect(first.result.invoiceNumber).toMatch(/^INV-\d{4}-0001$/);
    const second = await confirmSignup(ENV, store, store, gw, input, NOW);
    expect(second.cached).toBe(true);
    expect(second.result.invoiceId).toBe(first.result.invoiceId);
    expect((await store.listInvoicesForOrg("o1"))).toHaveLength(1);
    const sub = await store.getSubscription(first.result.subscriptionId);
    expect(sub?.defaultPaymentMethodId).toBeTruthy();
    expect(sub?.nextCharge).toBeGreaterThan(NOW);
  });

  it("rejects amount mismatches (no underpay)", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "track_2", orgId: "o1", amountMinor: 100 });
    await expect(
      confirmSignup(
        ENV, store, store, fakeGateway(), {
          orgId: "o1", userId: "u1", planId: "launch", interval: "month" as const,
          tracker: "track_2", recipientEmails: [],
        }, NOW,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("applies percent coupons as negative lines", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.coupon({ id: "c1", code: "SAVE20", kind: "percent", percentOff: 20, duration: "once" });
    store.seed.customer("o1", await enc("cus_1"));
    // 19900 - 3980 = 15920 (no setup fee in the trial-first model)
    store.seed.session({ tracker: "track_3", orgId: "o1", amountMinor: 15920 });
    const gw = fakeGateway({ wallet: [{ token: "pm_new", last4: "4242" }] });
    const { result } = await confirmSignup(
      ENV, store, store, gw, {
        orgId: "o1", userId: "u1", planId: "launch", interval: "month" as const,
        couponCode: "save20", tracker: "track_3", recipientEmails: [],
      }, NOW,
    );
    expect(result.totalMinor).toBe(15920);
    const items = await store.getInvoiceItems(result.invoiceId);
    const discounts = items.filter((i) => i.amountMinor < 0);
    expect(discounts).toHaveLength(1);
    expect(discounts[0]?.amountMinor).toBe(-3980);
  });
});

describe("plan changes", () => {
  it("charges prorated upgrades immediately", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch", monthlyMinor: 19900, annualMinor: 199000, setupFeeMinor: 49700 });
    store.seed.plan({ id: "growth", name: "Growth", monthlyMinor: 29900, annualMinor: 299000, setupFeeMinor: 69700 });
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    // Exact halves: Jan (31 days), now mid-Jan-16 → 15.5/31 remain → 5000.
    const start = Date.UTC(2033, 0, 1) / 1000;
    const next = Date.UTC(2033, 1, 1) / 1000;
    const at = Date.UTC(2033, 0, 16, 12) / 1000;
    store.seed.subscription({
      id: "s1", orgId: "o1", planId: "launch", interval: "month",
      startDate: start, nextCharge: next, recurringAmountMinor: 19900,
    });
    const r = await changePlan(
      ENV, store, fakeGateway(),
      { orgId: "o1", userId: "u1", newPlanId: "growth", newInterval: "month", recipientEmails: [] }, at,
    );
    expect(r.kind).toBe("upgrade");
    expect(r.proratedMinor).toBe(5000);
    expect(r.invoiceId).toBeTruthy();
    expect((await store.getSubscription("s1"))?.recurringAmountMinor).toBe(29900);
  });

  it("schedules downgrades for next cycle with no charge", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch", monthlyMinor: 19900, annualMinor: 199000, setupFeeMinor: 49700 });
    store.seed.plan({ id: "growth", name: "Growth", monthlyMinor: 29900, annualMinor: 299000, setupFeeMinor: 69700 });
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({
      id: "s1", orgId: "o1", planId: "growth", interval: "month",
      startDate: NOW - 15 * 86400, nextCharge: NOW + 15 * 86400, recurringAmountMinor: 29900,
    });
    const gw = fakeGateway();
    const r = await changePlan(
      ENV, store, gw,
      { orgId: "o1", userId: "u1", newPlanId: "launch", newInterval: "month", recipientEmails: [] }, NOW,
    );
    expect(r.kind).toBe("downgrade");
    expect(r.proratedMinor).toBe(0);
    expect(gw.calls).toHaveLength(0);
    expect((await store.getSubscription("s1"))?.nextCharge).toBe(NOW + 15 * 86400);
  });
});

describe("cancel + methods + coupons", () => {
  it("cancels at period end", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW + 20 * 86400 });
    const r = await cancelSubscription(ENV, store, "o1", "u1", [], NOW);
    expect(r.accessUntil).toBe(NOW + 20 * 86400);
    expect((await store.getSubscription("s1"))?.status).toBe("canceled");
  });

  it("enforces method removal rules", async () => {
    const store = memoryStore();
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, status: "active" });
    await expect(removeMethod(store, "o1", "m1")).rejects.toMatchObject({ status: 409 });
    store.seed.method({ id: "m2", orgId: "o1", isDefault: 0, status: "active" });
    await expect(removeMethod(store, "o1", "m1")).rejects.toMatchObject({ status: 409 });
    await setPrimary(store, "o1", "m2");
    await removeMethod(store, "o1", "m1");
    expect(await store.getPaymentMethod("m1")).toBeNull();
    expect((await store.getPaymentMethod("m2"))?.isDefault).toBe(1);
  });

  it("validates coupon windows and plan applicability", async () => {
    const store = memoryStore();
    await seedOrg(store);
    store.seed.plan({ id: "growth", name: "Growth", monthlyMinor: 29900, annualMinor: 299000, setupFeeMinor: 69700 });
    store.seed.coupon({ id: "c1", code: "LAUNCH20", kind: "percent", percentOff: 20 });
    store.seed.couponPlan("c1", "launch");
    await expect(validateCoupon(store, "LAUNCH20", "growth", NOW)).rejects.toMatchObject({ status: 422 });
    const ok = await validateCoupon(store, "launch20", "launch", NOW);
    expect(ok.coupon.id).toBe("c1");
    expect(BillingError).toBeTruthy();
  });
});

describe("renewal reminders", () => {
  async function seedBillableOrg(store: ReturnType<typeof memoryStore>, nextCharge: number) {
    store.seed.plan({ id: "launch", name: "Launch" });
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.user({ id: "u1", email: "boss@acme.com", name: "Boss Person" });
    store.seed.member("o1", "u1", "admin");
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge, interval: "month" });
  }

  it("sends once per period with personalized copy", async () => {
    const store = memoryStore();
    await seedBillableOrg(store, NOW + 86400);
    const outbox = captureEmails();
    const { sendRenewalReminders } = await import("../src/server/billing/renewals");
    expect(await sendRenewalReminders(ENV, store, NOW)).toBe(1);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.subject).toBe("Tradesmatic Subscription - Payment Renewal Ahead!");
    expect(outbox[0]?.html).toContain("Hi Boss,");
    expect(outbox[0]?.html).toContain("monthly subscription");
    expect(outbox[0]?.html).toContain("$199.00");
    expect(outbox[0]?.html).toContain("Tradesmatic");
    expect(outbox[0]?.html).toContain("help@test.com");
    expect(outbox[0]?.html).toContain("click here");
    expect((await store.getSubscription("s1"))?.renewalReminderFor).toBe(NOW + 86400);
    // Second run the next day stays silent for the same period.
    expect(await sendRenewalReminders(ENV, store, NOW + 86400)).toBe(0);
    expect(outbox).toHaveLength(1);
  });

  it("stays silent outside the window, without methods, or when past_due", async () => {
    const { sendRenewalReminders } = await import("../src/server/billing/renewals");
    const far = memoryStore();
    await seedBillableOrg(far, NOW + 3 * 86400);
    expect(await sendRenewalReminders(ENV, far, NOW)).toBe(0);

    const noMethod = memoryStore();
    await seedBillableOrg(noMethod, NOW + 86400);
    // remove the only method
    await noMethod.deletePaymentMethod("m1");
    expect(await sendRenewalReminders(ENV, noMethod, NOW)).toBe(0);

    const pastDue = memoryStore();
    await seedBillableOrg(pastDue, NOW + 86400);
    await pastDue.updateSubscription("s1", { status: "past_due" });
    expect(await sendRenewalReminders(ENV, pastDue, NOW)).toBe(0);
  });
});
