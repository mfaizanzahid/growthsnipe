import { describe, expect, it } from "vitest";
import { activeMemberCount, canCreateOrg, orgAccess } from "../src/server/billing/access";
import { memoryStore } from "./memory-store";

const NOW = 2_000_000_000;

function baseStore() {
  const store = memoryStore();
  store.seed.plan({ id: "starter", name: "Starter", monthlyMinor: 1900, annualMinor: 19000, maxUsers: 1, allowBriefings: 0 });
  store.seed.plan({ id: "pro", name: "Pro", monthlyMinor: 2900, annualMinor: 29000, maxUsers: null, allowBriefings: 1 });
  return store;
}

describe("orgAccess", () => {
  it("none without a subscription", async () => {
    expect((await orgAccess(baseStore(), "o9", NOW)).state).toBe("none");
  });

  it("trial counts as full Pro access until trial_ends_at", async () => {
    const store = baseStore();
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "pro", status: "trialing", trialEndsAt: NOW + 5 * 86400 });
    const access = await orgAccess(store, "o1", NOW);
    expect(access.state).toBe("trial");
    expect(access.trialDaysLeft).toBe(5);
    expect(access.maxUsers).toBeNull();
    expect(access.allowBriefings).toBe(true);
  });

  it("expired trial gates", async () => {
    const store = baseStore();
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "pro", status: "trialing", trialEndsAt: NOW - 10 });
    expect((await orgAccess(store, "o1", NOW)).state).toBe("expired");
    store.seed.subscription({ id: "s2", orgId: "o2", planId: "pro", status: "trial_expired", trialEndsAt: NOW - 10 });
    expect((await orgAccess(store, "o2", NOW)).state).toBe("expired");
  });

  it("reads plan limits for active subscriptions", async () => {
    const store = baseStore();
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "starter", status: "active" });
    const access = await orgAccess(store, "o1", NOW);
    expect(access.state).toBe("active");
    expect(access.maxUsers).toBe(1);
    expect(access.allowBriefings).toBe(false);
  });

  it("canceled keeps access until period end", async () => {
    const store = baseStore();
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "pro", status: "canceled", nextCharge: NOW + 100 });
    expect((await orgAccess(store, "o1", NOW)).state).toBe("active");
    store.seed.subscription({ id: "s2", orgId: "o2", planId: "pro", status: "canceled", nextCharge: NOW - 100 });
    expect((await orgAccess(store, "o2", NOW)).state).toBe("expired");
  });

  it("past_due gates", async () => {
    const store = baseStore();
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "pro", status: "past_due", nextCharge: NOW - 100 });
    expect((await orgAccess(store, "o1", NOW)).state).toBe("expired");
  });
});

describe("prepaid trial (subscribed during the trial)", () => {
  it("keeps the trial tier until the trial ends", async () => {
    const store = baseStore();
    store.seed.subscription({
      id: "s1",
      orgId: "o1",
      planId: "starter",
      status: "trialing",
      trialEndsAt: NOW + 5 * 86400,
      trialPrepaid: 1,
    });
    const access = await orgAccess(store, "o1", NOW);
    expect(access.state).toBe("trial");
    expect(access.trialDaysLeft).toBe(5);
    // The trial tier, not the paid plan's limits.
    expect(access.maxUsers).toBeNull();
    expect(access.allowBriefings).toBe(true);
  });

  it("switches to the paid plan when the trial ends, without waiting for the Cron", async () => {
    const store = baseStore();
    store.seed.subscription({
      id: "s1",
      orgId: "o1",
      planId: "starter",
      status: "trialing",
      trialEndsAt: NOW - 10,
      trialPrepaid: 1,
    });
    const access = await orgAccess(store, "o1", NOW);
    expect(access.state).toBe("active");
    expect(access.planId).toBe("starter");
    expect(access.maxUsers).toBe(1);
    expect(access.allowBriefings).toBe(false);
  });

  it("keeps a canceled prepaid trial served until the paid period ends", async () => {
    const store = baseStore();
    store.seed.subscription({
      id: "s1",
      orgId: "o1",
      planId: "starter",
      status: "canceled",
      trialEndsAt: NOW + 5 * 86400,
      trialPrepaid: 1,
      nextCharge: NOW + 30 * 86400,
    });
    expect((await orgAccess(store, "o1", NOW)).state).toBe("trial");
    expect((await orgAccess(store, "o1", NOW + 6 * 86400)).state).toBe("active");
    expect((await orgAccess(store, "o1", NOW + 40 * 86400)).state).toBe("expired");
  });
});

describe("canCreateOrg", () => {
  it("allows the first org, blocks during trial, allows when paid", async () => {
    const store = baseStore();
    store.seed.org({ id: "o1", name: "One" });
    store.seed.member("o1", "u1", "admin");
    expect((await canCreateOrg(store, "new-user", NOW)).ok).toBe(true);
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "pro", status: "trialing", trialEndsAt: NOW + 100 });
    const blocked = await canCreateOrg(store, "u1", NOW);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason ?? "").toMatch(/trial/i);
  });

  it("allows when the first org is paid", async () => {
    const store = baseStore();
    store.seed.org({ id: "o1", name: "One" });
    store.seed.member("o1", "u1", "admin");
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "starter", status: "active" });
    expect((await canCreateOrg(store, "u1", NOW)).ok).toBe(true);
  });

  it("allows when the first org's trial is prepaid (the customer has paid)", async () => {
    const store = baseStore();
    store.seed.org({ id: "o1", name: "One" });
    store.seed.member("o1", "u1", "admin");
    store.seed.subscription({
      id: "s1",
      orgId: "o1",
      planId: "starter",
      status: "trialing",
      trialEndsAt: NOW + 5 * 86400,
      trialPrepaid: 1,
    });
    expect((await canCreateOrg(store, "u1", NOW)).ok).toBe(true);
  });

  it("blocks again when a prepaid trial is canceled", async () => {
    const store = baseStore();
    store.seed.org({ id: "o1", name: "One" });
    store.seed.member("o1", "u1", "admin");
    store.seed.subscription({
      id: "s1",
      orgId: "o1",
      planId: "starter",
      status: "canceled",
      trialEndsAt: NOW + 5 * 86400,
      trialPrepaid: 1,
      nextCharge: NOW + 30 * 86400,
    });
    expect((await canCreateOrg(store, "u1", NOW)).ok).toBe(false);
  });
});

describe("activeMemberCount", () => {
  it("counts actives only", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "One" });
    store.seed.user({ id: "u1", email: "a@x.com" });
    store.seed.user({ id: "u2", email: "b@x.com" });
    store.seed.member("o1", "u1", "admin");
    store.seed.member("o1", "u2", "user");
    expect(await activeMemberCount(store, "o1")).toBe(2);
  });
});
