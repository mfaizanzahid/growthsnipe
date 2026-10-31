import { describe, expect, it } from "vitest";
import { freshInvites, invitations, members, users } from "../db/schema";
import {
  consumeFreshInvite,
  createFreshInvite,
  emailHasWorkspace,
  firstOrgInviteVerdict,
  getFreshInviteById,
  getValidFreshInvite,
  listFreshInvites,
  revokeFreshInvite,
} from "../src/server/repositories/billing";
import { createSuperadminRoutes } from "../src/server/routes/superadmin";
import { memoryStore } from "./memory-store";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";

const ENV = {} as unknown as Env;
const BOSS: SessionUser = { id: "u9", email: "boss@test.com", emailVerified: true };

type Row = Record<string, unknown>;

/** Table-aware fake Db: where()/join conditions are opaque, so each scenario
 *  stages exactly the rows the code path under test should observe. */
function fakeDb(scenario: {
  fresh?: Row[];
  invitations?: Row[];
  memberships?: Row[];
  users?: Row[];
} = {}) {
  const fresh: Row[] = scenario.fresh ?? [];
  const rowsFor = (table: unknown): Row[] => {
    if (table === freshInvites) return fresh;
    if (table === invitations) return scenario.invitations ?? [];
    if (table === members) return scenario.memberships ?? [];
    if (table === users) return scenario.users ?? [];
    return [];
  };
  const selectChain = () => {
    const c: Record<string, unknown> = {};
    let table: unknown = null;
    c["from"] = (t: unknown) => {
      table = t;
      return c;
    };
    c["innerJoin"] = () => c;
    c["where"] = () => c;
    c["orderBy"] = () => c;
    c["limit"] = async (n?: number) => {
      const rows = rowsFor(table);
      return typeof n === "number" ? rows.slice(0, n) : rows;
    };
    c["then"] = (resolve: (v: Row[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rowsFor(table)).then(resolve, reject);
    return c;
  };
  const db = {
    select: () => selectChain(),
    insert: (t: unknown) => ({
      values: async (row: Row) => {
        if (t === freshInvites) fresh.push({ ...row });
      },
    }),
    update: (t: unknown) => ({
      set: (patch: Row) => ({
        where: async () => {
          if (t === freshInvites) fresh.forEach((r) => Object.assign(r, patch));
        },
      }),
    }),
    delete: (t: unknown) => ({
      where: async () => {
        if (t === freshInvites) fresh.length = 0;
      },
    }),
  } as unknown as Db;
  return { db, fresh };
}

function throwingDb(): Db {
  return {
    select: () => {
      throw new Error("db down");
    },
  } as unknown as Db;
}

describe("fresh invite helpers", () => {
  it("creates and reads back a valid invite", async () => {
    const { db } = fakeDb();
    const created = await createFreshInvite(db, { id: "f1", email: "New@Example.com", inviterId: "u9" });
    expect(created.email).toBe("new@example.com");
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await getValidFreshInvite(db, "NEW@example.com")).toMatchObject({ id: "f1" });
    // Unknown address: the DB returns no row (the fake stages per-scenario rows).
    expect(await getValidFreshInvite(fakeDb().db, "other@example.com")).toBeNull();
  });

  it("treats consumed and expired invites as invalid", async () => {
    const used = fakeDb({
      fresh: [
        { id: "used", email: "used@example.com", consumedAt: new Date(), expiresAt: new Date(Date.now() + 99999) },
      ],
    });
    expect(await getValidFreshInvite(used.db, "used@example.com")).toBeNull();
    const old = fakeDb({
      fresh: [
        { id: "old", email: "old@example.com", consumedAt: null, expiresAt: new Date(Date.now() - 1000) },
      ],
    });
    expect(await getValidFreshInvite(old.db, "old@example.com")).toBeNull();
  });

  it("consumes, lists, and revokes", async () => {
    const { db } = fakeDb();
    await createFreshInvite(db, { id: "f1", email: "a@example.com", inviterId: "u9" });
    await consumeFreshInvite(db, "a@example.com");
    expect(await getValidFreshInvite(db, "a@example.com")).toBeNull();
    expect((await listFreshInvites(db))).toHaveLength(1);
    expect(await getFreshInviteById(db, "f1")).toMatchObject({ id: "f1" });
    expect(await getFreshInviteById(fakeDb().db, "nope")).toBeNull();
    expect(await revokeFreshInvite(fakeDb().db, "nope")).toBe(false);
    expect(await revokeFreshInvite(db, "f1")).toBe(true);
    expect((await listFreshInvites(db))).toHaveLength(0);
  });

  it("detects workspace membership by email", async () => {
    const withMember = fakeDb({
      users: [{ id: "u1", email: "owner@acme.com" }],
      memberships: [{ id: "m1", userId: "u1" }],
    });
    expect(await emailHasWorkspace(withMember.db, "owner@acme.com")).toBe(true);
    expect(await emailHasWorkspace(fakeDb({ users: [{ id: "u1", email: "solo@acme.com" }] }).db, "solo@acme.com")).toBe(false);
    expect(await emailHasWorkspace(fakeDb().db, "ghost@acme.com")).toBe(false);
  });
});

describe("firstOrgInviteVerdict", () => {
  it("passes members through", async () => {
    const { db } = fakeDb({ memberships: [{ id: "m1" }] });
    expect(await firstOrgInviteVerdict(db, "u1", "owner@acme.com")).toEqual({ ok: true });
  });

  it("passes pending org invitations and fresh invites", async () => {
    const orgInvited = fakeDb({ invitations: [{ id: "i1" }] });
    expect(await firstOrgInviteVerdict(orgInvited.db, "u2", "invitee@acme.com")).toEqual({ ok: true });
    const fresh = fakeDb({
      fresh: [{ id: "f1", email: "fresh@acme.com", consumedAt: null, expiresAt: new Date(Date.now() + 99999) }],
    });
    expect(await firstOrgInviteVerdict(fresh.db, "u3", "fresh@acme.com")).toEqual({ ok: true });
  });

  it("denies strangers and fails open when lookups error", async () => {
    const { db } = fakeDb();
    const denied = await firstOrgInviteVerdict(db, "u9", "stranger@acme.com");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/Invite required/);
    expect(await firstOrgInviteVerdict(throwingDb(), "u9", "stranger@acme.com")).toEqual({ ok: true });
  });
});

describe("superadmin fresh invites routes", () => {
  function buildApp(db: Db, superadmin: boolean, calls: string[]) {
    const memberStore: MemberStore = {
      getMember: async () => null,
      isSuperadmin: async () => superadmin,
      seedSuperadmins: async () => undefined,
    };
    const store = memoryStore();
    return createSuperadminRoutes({
      session: async () => BOSS,
      store: memberStore,
      ctx: {
        db,
        auth: {
          api: {
            signInMagicLink: async ({ body }: { body: { email: string } }) => {
              calls.push(body.email);
              return { status: true };
            },
          },
        } as unknown as Auth,
      },
      billing: store,
      gateway: {
        createCustomer: async () => "cus",
        createPaymentSession: async () => "t",
        createClientAuthToken: async () => "t",
        chargeSavedCard: async () => ({ tracker: "t", chargeId: "c" }),
        listWallet: async () => [],
        checkTrackerStatus: async () => "succeeded",
        refund: async () => ({ gatewayReference: "g", refundId: "r" }),
      },
      idem: store,
    });
  }

  function call(app: ReturnType<typeof buildApp>, path: string, body?: unknown, method = "POST") {
    return app.request(
      path,
      { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined },
      ENV,
    );
  }

  it("creates an invite and sends the link, rejects duplicates and members", async () => {
    const { db } = fakeDb();
    const calls: string[] = [];
    const app = buildApp(db, true, calls);
    const created = await call(app, "/api/superadmin/invites", { email: "fresh@acme.com" });
    expect(created.status).toBe(201);
    expect(calls).toEqual(["fresh@acme.com"]);

    const duplicate = await call(app, "/api/superadmin/invites", { email: "fresh@acme.com" });
    expect(duplicate.status).toBe(409);

    const invalid = await call(app, "/api/superadmin/invites", { email: "not-an-email" });
    expect(invalid.status).toBe(422);

    const listed = await app.request("/api/superadmin/invites", {}, ENV);
    expect(listed.status).toBe(200);
    expect((((await listed.json()) as { invites: unknown[] }).invites)).toHaveLength(1);
  });

  it("409s when the email already belongs to a workspace", async () => {
    const { db } = fakeDb({
      users: [{ id: "u1", email: "owner@acme.com" }],
      memberships: [{ id: "m1", userId: "u1" }],
    });
    const app = buildApp(db, true, []);
    expect((await call(app, "/api/superadmin/invites", { email: "owner@acme.com" })).status).toBe(409);
  });

  it("resends and revokes", async () => {
    const { db, fresh } = fakeDb({
      fresh: [{ id: "f1", email: "fresh@acme.com", consumedAt: null, expiresAt: new Date(Date.now() + 99999) }],
    });
    const calls: string[] = [];
    const app = buildApp(db, true, calls);
    expect((await call(app, "/api/superadmin/invites/f1/resend")).status).toBe(200);
    expect(calls).toEqual(["fresh@acme.com"]);
    expect((await call(app, "/api/superadmin/invites/f1", undefined, "DELETE")).status).toBe(200);
    expect(fresh).toHaveLength(0);
    expect((await call(app, "/api/superadmin/invites/f1/resend")).status).toBe(404);

    const emptyApp = buildApp(fakeDb().db, true, []);
    expect((await call(emptyApp, "/api/superadmin/invites/nope/resend")).status).toBe(404);
    expect((await call(emptyApp, "/api/superadmin/invites/nope", undefined, "DELETE")).status).toBe(404);
  });

  it("403s non-superadmins", async () => {
    const { db } = fakeDb();
    const app = buildApp(db, false, []);
    expect((await call(app, "/api/superadmin/invites", { email: "x@y.com" })).status).toBe(403);
  });
});
