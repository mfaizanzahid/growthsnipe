import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  requireOrgRole,
  requireSuperadmin,
  sessionGuard,
  type MemberStore,
  type SessionUser,
} from "../src/server/middleware";

const USER: SessionUser = {
  id: "u1",
  email: "user@example.com",
  emailVerified: true,
};

function buildApp(opts: {
  session?: SessionUser | null;
  store?: MemberStore;
  minRole?: "admin" | "user" | "viewer";
  allowSuperadmin?: boolean;
  withOrgParam?: boolean;
}) {
  const store: MemberStore =
    opts.store ?? {
      getMember: async () => null,
      isSuperadmin: async () => false,
      seedSuperadmins: async () => undefined,
    };
  const app = new Hono();
  const path = opts.withOrgParam ? "/probe/:orgId" : "/probe";
  app.get(
    path,
    sessionGuard(async () => opts.session ?? null),
    requireOrgRole(opts.minRole ?? "viewer", {
      allowSuperadmin: opts.allowSuperadmin,
      store,
    }),
    (c) =>
      c.json({
        orgId: c.get("orgId"),
        role: c.get("orgRole"),
        superadmin: c.get("superadmin") ?? false,
      }),
  );
  return app;
}

function buildSuperadminApp(opts: { session?: SessionUser | null; store?: MemberStore }) {
  const store: MemberStore =
    opts.store ?? {
      getMember: async () => null,
      isSuperadmin: async () => false,
      seedSuperadmins: async () => undefined,
    };
  const app = new Hono();
  app.get(
    "/admin",
    sessionGuard(async () => opts.session ?? null),
    requireSuperadmin({ store }),
    (c) => c.json({ ok: true }),
  );
  return app;
}

describe("session + org role guards", () => {
  it("401 without a session", async () => {
    const res = await buildApp({ session: null, withOrgParam: true }).request("/probe/o1");
    expect(res.status).toBe(401);
  });

  it("422 when orgId is missing", async () => {
    const res = await buildApp({ session: USER }).request("/probe");
    expect(res.status).toBe(422);
  });

  it("403 for non-members", async () => {
    const res = await buildApp({ session: USER, withOrgParam: true }).request("/probe/o1");
    expect(res.status).toBe(403);
  });

  it("200 with the member role", async () => {
    const app = buildApp({
      session: USER,
      withOrgParam: true,
      store: {
        getMember: async () => ({ role: "user" }),
        isSuperadmin: async () => false,
        seedSuperadmins: async () => undefined,
      },
    });
    const res = await app.request("/probe/o1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ orgId: "o1", role: "user" });
  });

  it("403 when role is below the minimum", async () => {
    const app = buildApp({
      session: USER,
      withOrgParam: true,
      minRole: "admin",
      store: {
        getMember: async () => ({ role: "user" }),
        isSuperadmin: async () => false,
        seedSuperadmins: async () => undefined,
      },
    });
    const res = await app.request("/probe/o1");
    expect(res.status).toBe(403);
  });

  it("403 for suspended members", async () => {
    const app = buildApp({
      session: USER,
      withOrgParam: true,
      store: {
        getMember: async () => ({ role: "admin", status: "suspended" }),
        isSuperadmin: async () => false,
        seedSuperadmins: async () => undefined,
      },
    });
    expect((await app.request("/probe/o1")).status).toBe(403);
  });

  it("403 for unknown role strings", async () => {
    const app = buildApp({
      session: USER,
      withOrgParam: true,
      store: {
        getMember: async () => ({ role: "owner" }),
        isSuperadmin: async () => false,
        seedSuperadmins: async () => undefined,
      },
    });
    const res = await app.request("/probe/o1");
    expect(res.status).toBe(403);
  });

  it("superadmin bypasses membership only when allowed", async () => {
    const store: MemberStore = {
      getMember: async () => null,
      isSuperadmin: async () => true,
      seedSuperadmins: async () => undefined,
    };
    const allowed = await buildApp({
      session: USER,
      withOrgParam: true,
      allowSuperadmin: true,
      store,
    }).request("/probe/o1");
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ superadmin: true });

    const denied = await buildApp({
      session: USER,
      withOrgParam: true,
      store,
    }).request("/probe/o1");
    expect(denied.status).toBe(403);
  });

  it("reads orgId from the query string", async () => {
    const app = buildApp({
      session: USER,
      store: {
        getMember: async (orgId) => (orgId === "oq" ? { role: "viewer" } : null),
        isSuperadmin: async () => false,
        seedSuperadmins: async () => undefined,
      },
    });
    const res = await app.request("/probe?orgId=oq");
    expect(res.status).toBe(200);
  });
});

describe("superadmin gate", () => {
  it("403 for non-superadmins, 200 for superadmins", async () => {
    const denied = await buildSuperadminApp({ session: USER }).request("/admin");
    expect(denied.status).toBe(403);

    const allowed = await buildSuperadminApp({
      session: USER,
      store: {
        getMember: async () => null,
        isSuperadmin: async () => true,
        seedSuperadmins: async () => undefined,
      },
    }).request("/admin");
    expect(allowed.status).toBe(200);
  });

  it("seeds before checking the flag", async () => {
    let seeded: string[] = [];
    let flagged = false;
    const res = await buildSuperadminApp({
      session: USER,
      store: {
        getMember: async () => null,
        isSuperadmin: async () => flagged,
        seedSuperadmins: async (emails) => {
          seeded = emails;
          flagged = true;
        },
      },
    }).request("/admin", undefined, { SUPERADMIN_EMAILS: "boss@x.com" });
    expect(seeded).toEqual(["boss@x.com"]);
    expect(res.status).toBe(200);
  });
});
