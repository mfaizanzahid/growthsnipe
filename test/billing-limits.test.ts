import { describe, expect, it } from "vitest";
import { enforcePlanLimits } from "../src/server/billing/access-limits";
import { setMemberAccess } from "../src/server/billing/admin";
import { memoryStore } from "./memory-store";

async function memberId(store: ReturnType<typeof memoryStore>, orgId: string, userId: string) {
  const m = (await store.listOrgMembers(orgId)).find((x) => x.userId === userId)!;
  return m.id;
}

function deps(store: ReturnType<typeof memoryStore>, schedules: Array<{ id: string; enabled: boolean }>) {
  return {
    getPlan: (id: string) => store.getPlan(id),
    listMembers: async (orgId: string) => {
      const all = await store.listOrgMembers(orgId);
      return all.map((m) => ({ id: m.id, role: m.role, status: m.status, suspendedBy: m.suspendedBy, createdAt: m.createdAt }));
    },
    setMemberStatus: (orgId: string, memberId: string, status: "active" | "suspended", suspendedBy?: string | null) =>
      store.setMemberStatus(orgId, memberId, status, suspendedBy),
    listSchedules: async () => schedules.map((s) => ({ ...s })),
    updateSchedule: async (id: string, _orgId: string, patch: { enabled: boolean }) => {
      const s = schedules.find((x) => x.id === id);
      if (s) s.enabled = patch.enabled;
    },
  };
}

function seedOrg(store: ReturnType<typeof memoryStore>) {
  store.seed.plan({ id: "starter", name: "Starter", maxUsers: 1, allowBriefings: 0 });
  store.seed.plan({ id: "pro", name: "Pro", maxUsers: null, allowBriefings: 1 });
  store.seed.org({ id: "o1", name: "One" });
}

describe("enforcePlanLimits", () => {
  it("suspends members beyond the cap, keeping the oldest (admin-safe)", async () => {
    const store = memoryStore();
    seedOrg(store);
    for (const [u, role, at] of [["u1", "admin", 100], ["u2", "user", 200], ["u3", "viewer", 300]] as const) {
      store.seed.user({ id: u, email: `${u}@x.com` });
      store.seed.member("o1", u, role, at);
    }
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    const members = await store.listOrgMembers("o1");
    const byUser = Object.fromEntries(members.map((m) => [m.userId, m.status]));
    expect(byUser["u1"]).toBe("active");
    expect(byUser["u2"]).toBe("suspended");
    expect(byUser["u3"]).toBe("suspended");
  });

  it("never suspends the last active admin", async () => {
    const store = memoryStore();
    seedOrg(store);
    store.seed.user({ id: "u1", email: "a@x.com" });
    store.seed.user({ id: "u2", email: "b@x.com" });
    // Newest is the only admin: keep the admin, suspend the older non-admin.
    store.seed.member("o1", "u1", "user", 100);
    store.seed.member("o1", "u2", "admin", 200);
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    const byUser = Object.fromEntries((await store.listOrgMembers("o1")).map((m) => [m.userId, m.status]));
    expect(byUser["u2"]).toBe("active");
    expect(byUser["u1"]).toBe("suspended");
  });

  it("disables schedules when briefings are not allowed", async () => {
    const store = memoryStore();
    seedOrg(store);
    const schedules = [{ id: "s1", enabled: true }, { id: "s2", enabled: false }];
    await enforcePlanLimits(deps(store, schedules), "o1", "starter");
    expect(schedules).toEqual([{ id: "s1", enabled: false }, { id: "s2", enabled: false }]);
  });

  it("reactivates all suspended members on upgrade to an unlimited plan", async () => {
    const store = memoryStore();
    seedOrg(store);
    for (const [u, role, at] of [["u1", "admin", 100], ["u2", "user", 200], ["u3", "viewer", 300]] as const) {
      store.seed.user({ id: u, email: `${u}@x.com` });
      store.seed.member("o1", u, role, at);
    }
    // Starter suspends the extras…
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    // …upgrading to Pro restores them.
    await enforcePlanLimits(deps(store, []), "o1", "pro", { reactivate: true });
    expect((await store.listOrgMembers("o1")).every((m) => m.status === "active")).toBe(true);
  });

  it("reactivates only up to a capped plan's free seats, oldest first", async () => {
    const store = memoryStore();
    seedOrg(store);
    store.seed.plan({ id: "team", name: "Team", maxUsers: 2, allowBriefings: 1 });
    for (const [u, role, at] of [["u1", "admin", 100], ["u2", "user", 200], ["u3", "user", 300], ["u4", "viewer", 400]] as const) {
      store.seed.user({ id: u, email: `${u}@x.com` });
      store.seed.member("o1", u, role, at);
    }
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    await enforcePlanLimits(deps(store, []), "o1", "team", { reactivate: true });
    const byUser = Object.fromEntries((await store.listOrgMembers("o1")).map((m) => [m.userId, m.status]));
    expect(byUser).toEqual({ u1: "active", u2: "active", u3: "suspended", u4: "suspended" });
  });

  it("does not reactivate on downgrade (no flag)", async () => {
    const store = memoryStore();
    seedOrg(store);
    store.seed.user({ id: "u1", email: "a@x.com" });
    store.seed.user({ id: "u2", email: "b@x.com" });
    store.seed.member("o1", "u1", "admin", 100);
    store.seed.member("o1", "u2", "user", 200);
    const u2 = (await store.listOrgMembers("o1")).find((m) => m.userId === "u2")!;
    await store.setMemberStatus("o1", u2.id, "suspended");
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    const byUser = Object.fromEntries((await store.listOrgMembers("o1")).map((m) => [m.userId, m.status]));
    expect(byUser).toEqual({ u1: "active", u2: "suspended" });
  });

  it("never auto-restores admin-suspended members on upgrade", async () => {
    const store = memoryStore();
    seedOrg(store);
    for (const [u, role, at] of [["u1", "admin", 100], ["u2", "user", 200], ["u3", "user", 300]] as const) {
      store.seed.user({ id: u, email: `${u}@x.com` });
      store.seed.member("o1", u, role, at);
    }
    // Manual suspension is marked admin…
    await setMemberAccess(store, "o1", await memberId(store, "o1", "u3"), "suspended");
    // …Starter suspends the other extra as plan_limits…
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    // …and upgrading restores only the enforcement-suspended member.
    await enforcePlanLimits(deps(store, []), "o1", "pro", { reactivate: true });
    const byUser = Object.fromEntries((await store.listOrgMembers("o1")).map((m) => [m.userId, m]));
    expect(byUser["u1"]!.status).toBe("active");
    expect(byUser["u2"]!.status).toBe("active");
    expect(byUser["u2"]!.suspendedBy).toBeNull();
    expect(byUser["u3"]!.status).toBe("suspended");
    expect(byUser["u3"]!.suspendedBy).toBe("admin");
  });

  it("leaves legacy unmarked suspensions alone (fail closed)", async () => {
    const store = memoryStore();
    seedOrg(store);
    store.seed.user({ id: "u1", email: "a@x.com" });
    store.seed.user({ id: "u2", email: "b@x.com" });
    store.seed.member("o1", "u1", "admin", 100);
    store.seed.member("o1", "u2", "user", 200);
    // Pre-marker suspension carries no provenance…
    await store.setMemberStatus("o1", await memberId(store, "o1", "u2"), "suspended");
    await enforcePlanLimits(deps(store, []), "o1", "pro", { reactivate: true });
    const u2 = (await store.listOrgMembers("o1")).find((m) => m.userId === "u2")!;
    expect(u2.status).toBe("suspended");
  });

  it("marks enforcement suspensions as plan_limits", async () => {
    const store = memoryStore();
    seedOrg(store);
    store.seed.user({ id: "u1", email: "a@x.com" });
    store.seed.user({ id: "u2", email: "b@x.com" });
    store.seed.member("o1", "u1", "admin", 100);
    store.seed.member("o1", "u2", "user", 200);
    await enforcePlanLimits(deps(store, []), "o1", "starter");
    const u2 = (await store.listOrgMembers("o1")).find((m) => m.userId === "u2")!;
    expect(u2.status).toBe("suspended");
    expect(u2.suspendedBy).toBe("plan_limits");
  });

  it("leaves pro orgs untouched", async () => {
    const store = memoryStore();
    seedOrg(store);
    store.seed.user({ id: "u1", email: "a@x.com" });
    store.seed.user({ id: "u2", email: "b@x.com" });
    store.seed.member("o1", "u1", "admin", 100);
    store.seed.member("o1", "u2", "user", 200);
    const schedules = [{ id: "s1", enabled: true }];
    await enforcePlanLimits(deps(store, schedules), "o1", "pro");
    expect((await store.listOrgMembers("o1")).every((m) => m.status === "active")).toBe(true);
    expect(schedules[0]?.enabled).toBe(true);
  });
});
