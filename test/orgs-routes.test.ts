import { describe, expect, it } from "vitest";
import { createOrgRoutes } from "../src/server/routes/orgs";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";

const USER: SessionUser = { id: "u1", email: "user@example.com", emailVerified: true };

const fakeCtx = { db: {} as unknown as Db, auth: {} as unknown as Auth };

function fakeStore(members: Record<string, string>): MemberStore {
  return {
    getMember: async (orgId, userId) => {
      const role = members[`${orgId}:${userId}`];
      return role ? { role } : null;
    },
    isSuperadmin: async () => false,
    seedSuperadmins: async () => undefined,
  };
}

describe("org routes", () => {
  it("401 without a session", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => null,
      store: fakeStore({}),
    });
    expect((await app.request("/api/orgs")).status).toBe(401);
  });

  it("lists the caller's orgs", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      orgs: {
        listForUser: async () => [{ id: "o1", name: "Acme", slug: "acme", role: "admin" }],
        create: async () => {
          throw new Error("unused");
        },
      },
    });
    const res = await app.request("/api/orgs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      orgs: [{ id: "o1", name: "Acme", slug: "acme", role: "admin" }],
    });
  });

  it("422 on invalid create payload", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
    });
    const res = await app.request("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(422);
  });

  it("201 on valid create", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      orgs: {
        listForUser: async () => [],
        create: async (_userId, input) => ({ id: "o9", name: input.name, slug: "acme-1" }),
      },
    });
    const res = await app.request("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Acme" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ org: { id: "o9", name: "Acme", slug: "acme-1" } });
  });

  it("membership probe reflects the caller role", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: fakeStore({ "o1:u1": "viewer" }),
    });
    const res = await app.request("/api/orgs/o1/membership");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ orgId: "o1", role: "viewer" });
  });

  it("membership probe 403 for outsiders", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: fakeStore({}),
    });
    expect((await app.request("/api/orgs/o1/membership")).status).toBe(403);
  });

  it("membership probe reports a gated workspace access state to any member", async () => {
    const { memoryStore } = await import("./memory-store");
    const billing = memoryStore();
    billing.seed.subscription({ id: "s1", orgId: "o1", status: "trial_expired" });
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: fakeStore({ "o1:u1": "user" }),
      billing,
    });
    const res = await app.request("/api/orgs/o1/membership");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      orgId: "o1",
      role: "user",
      access: { state: "expired", status: "trial_expired" },
    });
  });

  it("membership probe reports a live trial as Pro-tier access", async () => {
    const { memoryStore } = await import("./memory-store");
    const billing = memoryStore();
    billing.seed.subscription({
      id: "s1",
      orgId: "o1",
      status: "trialing",
      trialEndsAt: Math.floor(Date.now() / 1000) + 86_400,
    });
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: fakeStore({ "o1:u1": "admin" }),
      billing,
    });
    const body = (await (await app.request("/api/orgs/o1/membership")).json()) as {
      access: { state: string; proTier: boolean } | null;
    };
    expect(body.access?.state).toBe("trial");
    expect(body.access?.proTier).toBe(true);
  });

  it("membership probe survives a missing billing lookup (access null, never gated)", async () => {
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: fakeStore({ "o1:u1": "viewer" }),
    });
    const res = await app.request("/api/orgs/o1/membership");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "viewer", access: null });
  });

  it("returns profile with superadmin flag", async () => {
    const { memoryStore } = await import("./memory-store");
    const store = memoryStore();
    store.seed.user({ id: "u1", email: "user@example.com" });
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: {
        ...fakeStore({}),
        isSuperadmin: async () => true,
      },
      billing: store,
    });
    const res = await app.request("/api/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { id: "u1", email: "user@example.com" },
      superadmin: true,
      defaultOrgId: null,
    });
  });

  it("401 on /api/me without a session", async () => {
    const app = createOrgRoutes({ ctx: fakeCtx, session: async () => null, store: fakeStore({}) });
    expect((await app.request("/api/me")).status).toBe(401);
  });

  it("seeds superadmins before reading the flag on /api/me", async () => {
    const { memoryStore } = await import("./memory-store");
    const store = memoryStore();
    store.seed.user({ id: "u1", email: "user@example.com" });
    let seeded: string[] | null = null;
    let flagged = false;
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: {
        ...fakeStore({}),
        isSuperadmin: async () => flagged,
        seedSuperadmins: async (emails: string[]) => {
          seeded = emails;
          flagged = true;
        },
      },
      billing: store,
    });
    const res = await app.request("/api/me");
    expect(res.status).toBe(200);
    expect(seeded).not.toBeNull();
    expect(await res.json()).toMatchObject({ superadmin: true });
  });

  it("persists the default org for members only", async () => {
    const { memoryStore } = await import("./memory-store");
    const store = memoryStore();
    store.seed.user({ id: "u1", email: "user@example.com" });
    const app = createOrgRoutes({
      ctx: fakeCtx,
      session: async () => USER,
      store: fakeStore({ "o1:u1": "admin" }),
      billing: store,
    });
    const ok = await app.request("/api/me/default-org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "o1" }),
    });
    expect(ok.status).toBe(200);
    expect((await store.getUser("u1"))?.defaultOrgId).toBe("o1");

    const me = (await (await app.request("/api/me")).json()) as { defaultOrgId: string | null };
    expect(me.defaultOrgId).toBe("o1");

    const forbidden = await app.request("/api/me/default-org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "other" }),
    });
    expect(forbidden.status).toBe(403);

    const cleared = await app.request("/api/me/default-org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: null }),
    });
    expect(cleared.status).toBe(200);
    expect((await store.getUser("u1"))?.defaultOrgId).toBeNull();
  });
});
