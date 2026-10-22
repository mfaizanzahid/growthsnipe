import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import { encryptSecret } from "../src/server/lib/crypto";
import { captureEmails } from "../src/server/lib/email";
import { memoryStore, setStoreClock } from "./memory-store";
import type { Gateway } from "../src/server/billing/gateway";
import {
  attachCoupon,
  createCoupon,
  createPlan,
  createUsageCharge,
  deletePlan,
  getClientDetail,
  listClients,
  refundInvoice,
  setMemberAccess,
  updateCoupon,
  updatePlan,
} from "../src/server/billing/admin";

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

const NOW = 2_000_000_000;

function fakeGateway(fail = false): Gateway {
  return {
    createCustomer: async () => "cus_test",
    createPaymentSession: async () => "track_test",
    createClientAuthToken: async () => "tbt",
    chargeSavedCard: async () => {
      if (fail) throw new Error("declined");
      return { tracker: "track_u", chargeId: "ch_u" };
    },
    listWallet: async () => [],
    checkTrackerStatus: async () => "succeeded",
    refund: async () => ({ gatewayReference: "track_x", refundId: "ref_1" }),
  };
}

async function enc(token: string): Promise<string> {
  return encryptSecret(token, KEY);
}

beforeEach(() => {
  captureEmails();
  setStoreClock(NOW * 1000);
});

describe("plans management", () => {
  it("enforces max 4 active plans", async () => {
    const store = memoryStore();
    for (let i = 0; i < 4; i++) {
      await createPlan(store, { name: `P${i}`, monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 0 });
    }
    await expect(
      createPlan(store, { name: "P5", monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 0 }),
    ).rejects.toMatchObject({ status: 422 });
    // Inactive plans are still allowed.
    const p = await createPlan(store, { name: "P5", monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 0, active: 0 });
    expect(p.active).toBe(0);
    // Activating a 5th is blocked; archiving one frees a slot.
    await expect(updatePlan(store, p.id, { active: 1 })).rejects.toMatchObject({ status: 422 });
    const all = await store.listAllPlans();
    await updatePlan(store, all[0]!.id, { active: 0 });
    const activated = await updatePlan(store, p.id, { active: 1 });
    expect(activated.active).toBe(1);
  });

  it("stores and updates plan features", async () => {
    const store = memoryStore();
    const p = await createPlan(store, {
      name: "Starter",
      monthlyMinor: 1900,
      annualMinor: 19000,
      setupFeeMinor: 0,
      features: "1 user, 3 AI Advisors",
    });
    expect(p.features).toBe("1 user, 3 AI Advisors");
    const updated = await updatePlan(store, p.id, { features: "1 user, 3 AI Advisors, Standard support" });
    expect(updated.features).toBe("1 user, 3 AI Advisors, Standard support");
    await expect(updatePlan(store, p.id, { features: "x".repeat(2001) })).rejects.toMatchObject({ status: 422 });
    await expect(
      createPlan(store, { name: "Bad", monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 0, features: "x".repeat(2001) }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("blocks delete while subscriptions reference the plan", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch" });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch" });
    await expect(deletePlan(store, "launch")).rejects.toMatchObject({ status: 409 });
    await expect(deletePlan(store, "missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("usage charges", () => {
  it("creates an invoice and charges immediately", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_good") });
    const { result } = await createUsageCharge(
      ENV, store, store, fakeGateway(false),
      { orgId: "o1", amountMinor: 5000, description: "Extra seats", createdBy: "boss", recipientEmails: [] }, NOW,
    );
    expect(result.invoiceNumber).toMatch(/^INV-\d{4}-0001$/);
    expect((await store.getInvoice(result.invoiceId))?.status).toBe("paid");
  });

  it("leaves failed usage invoices unpaid without dunning", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await enc("pm_bad") });
    await expect(
      createUsageCharge(
        ENV, store, store, fakeGateway(true),
        { orgId: "o1", amountMinor: 5000, description: "Extra seats", createdBy: "boss", recipientEmails: [] }, NOW,
      ),
    ).rejects.toMatchObject({ status: 402 });
    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices[0]?.status).toBe("failed");
    expect(invoices[0]?.reminderCount).toBe(0);
  });
});

describe("refunds", () => {
  it("supports partial refunds and marks full refunds", async () => {
    const store = memoryStore();
    await store.createInvoice(
      { id: "inv1", orgId: "o1", type: "subscription", status: "paid", amountMinor: 19900, tracker: "track_1" },
      [{ description: "x", amountMinor: 19900 }],
      NOW,
    );
    const partial = await refundInvoice(ENV, store, fakeGateway(), {
      invoiceId: "inv1",
      amountMinor: 9900,
      recipientEmails: [],
    });
    expect(partial.invoiceStatus).toBe("paid");
    expect((await store.getInvoice("inv1"))?.status).toBe("paid");
    const full = await refundInvoice(ENV, store, fakeGateway(), { invoiceId: "inv1", recipientEmails: [] });
    expect(full.invoiceStatus).toBe("refunded");
    expect((await store.getInvoice("inv1"))?.status).toBe("refunded");
  });

  it("resolves invoices by human number", async () => {
    const store = memoryStore();
    await store.createInvoice(
      { id: "inv9", orgId: "o1", type: "usage", status: "paid", amountMinor: 5000, tracker: "track_9" },
      [{ description: "x", amountMinor: 5000 }],
      NOW,
    );
    const created = await store.getInvoice("inv9");
    const byNumber = await store.getInvoiceByNumberOrId(created!.number!);
    expect(byNumber?.id).toBe("inv9");
    const r = await refundInvoice(ENV, store, fakeGateway(), { invoiceId: created!.number!, recipientEmails: [] });
    expect(r.invoiceStatus).toBe("refunded");
  });

  it("rejects unpaid invoices and over-refunds", async () => {
    const store = memoryStore();
    await store.createInvoice(
      { id: "inv1", orgId: "o1", type: "subscription", status: "failed", amountMinor: 19900, tracker: "track_1" },
      [{ description: "x", amountMinor: 19900 }],
      NOW,
    );
    await expect(refundInvoice(ENV, store, fakeGateway(), { invoiceId: "inv1", recipientEmails: [] })).rejects.toMatchObject({ status: 422 });
  });
});

describe("coupons management", () => {
  it("creates, validates codes, and attaches to subscriptions", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch" });
    const c = await createCoupon(store, { code: "save20", kind: "percent", percentOff: 20, duration: "once", planIds: ["launch"] }, "boss");
    expect(c.code).toBe("SAVE20");
    await expect(
      createCoupon(store, { code: "SAVE20", kind: "percent", percentOff: 10, duration: "once" }, "boss"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      createCoupon(store, { code: "bad", kind: "percent", percentOff: 200, duration: "once" }, "boss"),
    ).rejects.toMatchObject({ status: 422 });

    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch" });
    await attachCoupon(store, "s1", "SAVE20", "launch", NOW);
    expect((await store.activeSubscriptionCoupon("s1"))?.couponId).toBe(c.id);
    expect((await store.getCouponById(c.id))?.redeemedCount).toBe(1);
    const updated = await updateCoupon(store, c.id, { active: 0 });
    expect(updated.active).toBe(0);
  });
});

describe("clients", () => {
  it("lists orgs with subscription and open balance", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.user({ id: "u1", email: "owner@acme.com" });
    store.seed.member("o1", "u1", "admin");
    store.seed.plan({ id: "launch", name: "Launch" });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", status: "past_due" });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "x", amountMinor: 19900 }],
      NOW,
    );
    const clients = await listClients(store);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ orgId: "o1", ownerEmail: "owner@acme.com", subscriptionStatus: "past_due", openAmountMinor: 19900 });
    const detail = await getClientDetail(store, "o1");
    expect(detail.members).toHaveLength(1);
    expect(detail.invoices).toHaveLength(1);
  });
});

describe("member access", () => {
  it("suspends and reactivates, never the last admin", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.user({ id: "u1", email: "boss@acme.com" });
    store.seed.user({ id: "u2", email: "staff@acme.com" });
    store.seed.member("o1", "u1", "admin");
    store.seed.member("o1", "u2", "user");

    await setMemberAccess(store, "o1", "mem_u2_o1", "suspended");
    const detail = await getClientDetail(store, "o1");
    expect(detail.members.find((m) => m.userId === "u2")?.status).toBe("suspended");

    await expect(setMemberAccess(store, "o1", "mem_u1_o1", "suspended")).rejects.toMatchObject({
      status: 409,
    });
    await setMemberAccess(store, "o1", "mem_u2_o1", "active");
    expect((await getClientDetail(store, "o1")).members.find((m) => m.userId === "u2")?.status).toBe("active");

    await expect(setMemberAccess(store, "o1", "nope", "suspended")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("trial-first plan rules", () => {
  it("rejects setup fees and plan-level trials, accepts limits", async () => {
    const store = memoryStore();
    await expect(
      createPlan(store, { name: "Bad", monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 100 }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createPlan(store, { name: "Bad", monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 0, trialPeriodDays: 7 }),
    ).rejects.toMatchObject({ status: 422 });
    const p = await createPlan(store, { name: "Starter", monthlyMinor: 1900, annualMinor: 19000, setupFeeMinor: 0, maxUsers: 1, allowBriefings: 0 });
    expect(p.maxUsers).toBe(1);
    expect(p.allowBriefings).toBe(0);
    await expect(createPlan(store, { name: "Bad", monthlyMinor: 100, annualMinor: 1000, setupFeeMinor: 0, maxUsers: 0 })).rejects.toMatchObject({ status: 422 });
  });
});
