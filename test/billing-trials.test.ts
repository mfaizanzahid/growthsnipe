import { describe, expect, it } from "vitest";
import { TRIAL_DAYS } from "../src/server/billing/access";
import { processTrials, startTrial, subscribe } from "../src/server/billing/trials";
import { utcMidnight, advanceBillingDate } from "../src/server/lib/billing-dates";
import { captureEmails } from "../src/server/lib/email";
import { encryptSecret } from "../src/server/lib/crypto";
import { memoryStore } from "./memory-store";
import type { Gateway } from "../src/server/billing/gateway";

const NOW = 2_000_000_000;
const DAY = 86400;

const KEY = (() => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
})();
const enc = (s: string) => encryptSecret(s, KEY);

function baseStore() {
  const store = memoryStore();
  store.seed.plan({ id: "snipe-intelligence", name: "SNIPE Intelligence", monthlyMinor: 19900, annualMinor: 199000, maxUsers: null, allowBriefings: 1 });
  store.seed.plan({ id: "starter", name: "Starter", monthlyMinor: 1900, annualMinor: 19000, maxUsers: 1, allowBriefings: 0 });
  store.seed.plan({ id: "pro", name: "Pro", monthlyMinor: 2900, annualMinor: 29000, maxUsers: null, allowBriefings: 1 });
  return store;
}

function fakeGateway(): Gateway {
  return {
    createCustomer: async () => "cus_test",
    createPaymentSession: async () => "track_sess_1",
    createClientAuthToken: async () => "tbt_test",
    chargeSavedCard: async () => ({ tracker: "track_c", chargeId: "ch_c" }),
    listWallet: async () => [{ token: "pm_new", last4: "4242" }],
    checkTrackerStatus: async () => "succeeded",
    refund: async () => ({ gatewayReference: "track_x" }),
  };
}

describe("startTrial", () => {
  it("starts a 30-day SNIPE Intelligence trial with no charge", async () => {
    expect(TRIAL_DAYS).toBe(30);
    const store = baseStore();
    const { subscriptionId, trialEndsAt } = await startTrial(store, { orgId: "o1", userId: "u1" }, NOW);
    expect(trialEndsAt).toBe(NOW + 30 * DAY);
    const sub = await store.getSubscription(subscriptionId);
    expect(sub?.status).toBe("trialing");
    expect(sub?.planId).toBe("snipe-intelligence");
    expect(sub?.defaultPaymentMethodId).toBeNull();
    expect(sub?.cyclesCharged).toBe(0);
  });

  it("refuses a second subscription for the org", async () => {
    const store = baseStore();
    await startTrial(store, { orgId: "o1", userId: "u1" }, NOW);
    await expect(startTrial(store, { orgId: "o1", userId: "u1" }, NOW)).rejects.toMatchObject({ status: 409 });
  });
});

describe("processTrials", () => {
  async function seedTrialing(store: ReturnType<typeof memoryStore>, trialEndsAt: number) {
    const { subscriptionId } = await startTrial(store, { orgId: "o1", userId: "u1" }, trialEndsAt - TRIAL_DAYS * DAY);
    return subscriptionId;
  }
  it("sends -5/-3/0 reminders once each, then flips to trial_expired", async () => {
    const outbox = captureEmails();
    const store = baseStore();
    const subId = await seedTrialing(store, NOW);
    const admins = async () => ["owner@test.com"];

    await processTrials({} as never, store, admins, NOW - 5 * DAY);
    await processTrials({} as never, store, admins, NOW - 3 * DAY);
    await processTrials({} as never, store, admins, NOW - 5 * DAY);
    expect(outbox.map((e) => e.subject)).toEqual([
      expect.stringMatching(/ends in 5 days/),
      expect.stringMatching(/ends in 3 days/),
    ]);

    const flipped = await processTrials({} as never, store, admins, NOW + 10);
    expect(flipped.expired).toBe(1);
    const sub = await store.getSubscription(subId);
    expect(sub?.status).toBe("trial_expired");
    const subjects = outbox.map((e) => e.subject);
    expect(subjects[subjects.length - 1]).toEqual(expect.stringMatching(/ended/));
  });

  it("sends +3/+5 post-expiry nudges once each", async () => {
    const outbox = captureEmails();
    const store = baseStore();
    await seedTrialing(store, NOW);
    const admins = async () => ["owner@test.com"];
    await processTrials({} as never, store, admins, NOW + 10);
    outbox.length = 0;
    await processTrials({} as never, store, admins, NOW + 3 * DAY + 10);
    await processTrials({} as never, store, admins, NOW + 5 * DAY + 10);
    await processTrials({} as never, store, admins, NOW + 5 * DAY + 20);
    expect(outbox.map((e) => e.html)).toEqual([
      expect.stringMatching(/ended 3 days ago/),
      expect.stringMatching(/ended 5 days ago/),
    ]);
  });
});

describe("subscribe during a trial", () => {
  const ENV = { SAFEPAY_PUBLIC_KEY: "pk", TOKEN_ENCRYPTION_KEY: KEY } as never;

  it("charges the first period now, keeps the trial tier, and anchors the renewal to the trial", async () => {
    const store = baseStore();
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "t1", orgId: "o1", amountMinor: 1900 });
    await startTrial(store, { orgId: "o1", userId: "u1" }, NOW);
    const trialEndsAt = NOW + TRIAL_DAYS * DAY;

    const { result } = await subscribe(
      ENV,
      store,
      store,
      fakeGateway(),
      { orgId: "o1", userId: "u1", planId: "starter", interval: "month", tracker: "t1", recipientEmails: [] },
      NOW,
    );

    // Charged immediately for the first period.
    expect(result.totalMinor).toBe(1900);
    expect(result.prepaid).toBe(true);
    expect(result.planStartsAt).toBe(trialEndsAt);

    const sub = await store.getOrgSubscription("o1");
    expect(sub?.status).toBe("trialing");
    expect(sub?.trialPrepaid).toBe(1);
    expect(sub?.planId).toBe("starter");
    expect(sub?.recurringAmountMinor).toBe(1900);
    expect(sub?.cyclesCharged).toBe(1);
    expect(sub?.trialEndsAt).toBe(trialEndsAt);
    // The renewal follows the trial: one interval after the plan starts.
    expect(sub?.nextCharge).toBe(advanceBillingDate(trialEndsAt, "month", 1));
    expect(sub?.nextCharge).toBeGreaterThan(trialEndsAt);

    const invoices = await store.listInvoicesForOrg("o1");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe("paid");
    expect(invoices[0]?.amountMinor).toBe(1900);
  });

  it("refuses a second subscription while a prepaid trial is running", async () => {
    const store = baseStore();
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "t1", orgId: "o1", amountMinor: 1900 });
    await startTrial(store, { orgId: "o1", userId: "u1" }, NOW);
    await subscribe(
      ENV,
      store,
      store,
      fakeGateway(),
      { orgId: "o1", userId: "u1", planId: "starter", interval: "month", tracker: "t1", recipientEmails: [] },
      NOW,
    );
    store.seed.session({ tracker: "t2", orgId: "o1", amountMinor: 1900 });
    await expect(
      subscribe(
        ENV,
        store,
        store,
        fakeGateway(),
        { orgId: "o1", userId: "u1", planId: "starter", interval: "month", tracker: "t2", recipientEmails: [] },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("starts paid immediately for orgs that never trialed", async () => {
    const store = baseStore();
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "t1", orgId: "o1", amountMinor: 2900 });
    const { result } = await subscribe(
      ENV,
      store,
      store,
      fakeGateway(),
      { orgId: "o1", userId: "u1", planId: "pro", interval: "month", tracker: "t1", recipientEmails: [] },
      NOW,
    );
    expect(result.totalMinor).toBe(2900);
    expect(result.prepaid).toBe(false);
    expect(result.planStartsAt).toBeNull();
    const sub = await store.getOrgSubscription("o1");
    expect(sub?.status).toBe("active");
    expect(sub?.trialPrepaid).toBe(0);
    expect(sub?.nextCharge).toBe(advanceBillingDate(utcMidnight(NOW), "month", 1));
  });

  it("refuses when already active", async () => {
    const store = baseStore();
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "t1", orgId: "o1", amountMinor: 2900 });
    await subscribe(
      ENV,
      store,
      store,
      fakeGateway(),
      { orgId: "o1", userId: "u1", planId: "pro", interval: "month", tracker: "t1", recipientEmails: [] },
      NOW,
    );
    await expect(
      subscribe(
        ENV,
        store,
        store,
        fakeGateway(),
        { orgId: "o1", userId: "u1", planId: "pro", interval: "month", tracker: "t1", recipientEmails: [] },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("activates a prepaid trial when the trial ends, without trial reminders", async () => {
    const outbox = captureEmails();
    const store = baseStore();
    store.seed.customer("o1", await enc("cus_1"));
    store.seed.session({ tracker: "t1", orgId: "o1", amountMinor: 1900 });
    await startTrial(store, { orgId: "o1", userId: "u1" }, NOW);
    const trialEndsAt = NOW + TRIAL_DAYS * DAY;
    await subscribe(
      ENV,
      store,
      store,
      fakeGateway(),
      { orgId: "o1", userId: "u1", planId: "starter", interval: "month", tracker: "t1", recipientEmails: [] },
      NOW,
    );
    outbox.length = 0;

    const admins = async () => ["owner@test.com"];
    const activated: Array<{ orgId: string; planId: string }> = [];

    // Before the trial ends: no reminders, no flip.
    const before = await processTrials({} as never, store, admins, trialEndsAt - 3 * DAY);
    expect(before.remindersSent).toBe(0);
    expect(before.activated).toBe(0);
    expect((await store.getOrgSubscription("o1"))?.status).toBe("trialing");

    // After the trial ends: the paid plan goes live.
    const after = await processTrials(
      {} as never,
      store,
      admins,
      trialEndsAt + 60,
      async (orgId, planId) => {
        activated.push({ orgId, planId });
      },
    );
    expect(after.activated).toBe(1);
    expect(after.expired).toBe(0);
    expect(activated).toEqual([{ orgId: "o1", planId: "starter" }]);

    const sub = await store.getOrgSubscription("o1");
    expect(sub?.status).toBe("active");
    expect(sub?.trialPrepaid).toBe(0);
    expect(sub?.trialEndsAt).toBeNull();
    // The renewal date is untouched by the flip.
    expect(sub?.nextCharge).toBe(advanceBillingDate(trialEndsAt, "month", 1));
    // No "your trial ended" nag - the customer already paid.
    expect(outbox.map((e) => e.subject)).toEqual([expect.stringMatching(/Subscription active/i)]);
  });
});

