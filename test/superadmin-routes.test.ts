import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import { encryptSecret } from "../src/server/lib/crypto";
import { captureEmails } from "../src/server/lib/email";
import { memoryStore, setStoreClock } from "./memory-store";
import { createSuperadminRoutes } from "../src/server/routes/superadmin";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type { Gateway } from "../src/server/billing/gateway";

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

const BOSS: SessionUser = { id: "u9", email: "boss@test.com", emailVerified: true };
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

/** Drizzle stub whose terminal `limit()` resolves to no rows. */
function emptyDrizzle(): Db {
  const api: Record<string, unknown> = {};
  api.select = () => api;
  api.from = () => api;
  api.where = () => api;
  api.limit = () => Promise.resolve([]);
  // Platform-log writes hit `insert`; the stub accepts and discards them.
  api.insert = () => ({ values: () => Promise.resolve() });
  return api as unknown as Db;
}

function buildApp(
  store: ReturnType<typeof memoryStore>,
  session: SessionUser | null,
  superadmin: boolean,
  db: Db = {} as unknown as Db,
) {
  const memberStore: MemberStore = {
    getMember: async () => null,
    isSuperadmin: async () => superadmin,
    seedSuperadmins: async () => undefined,
  };
  return createSuperadminRoutes({
    session: async () => session,
    store: memberStore,
    ctx: { db, auth: {} as unknown as Auth },
    billing: store,
    gateway: fakeGateway(),
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

beforeEach(() => {
  captureEmails();
  setStoreClock(NOW * 1000);
});

describe("superadmin route gates", () => {
  it("401 without session, 403 for non-superadmins", async () => {
    const store = memoryStore();
    expect((await buildApp(store, null, false).request("/api/superadmin/clients", {}, ENV)).status).toBe(401);
    expect((await buildApp(store, BOSS, false).request("/api/superadmin/clients", {}, ENV)).status).toBe(403);
    expect((await call(buildApp(store, BOSS, false), "/api/superadmin/usage-charges", {})).status).toBe(403);
    expect((await call(buildApp(store, BOSS, false), "/api/superadmin/refunds", {})).status).toBe(403);
  });
});

describe("superadmin clients + usage + refunds", () => {
  it("lists clients and creates a usage charge", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.user({ id: "u1", email: "owner@acme.com" });
    store.seed.member("o1", "u1", "admin");
    store.seed.customer("o1", await encryptSecret("cus_1", KEY));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await encryptSecret("pm_good", KEY) });
    const app = buildApp(store, BOSS, true);

    const clients = await app.request("/api/superadmin/clients", {}, ENV);
    expect(clients.status).toBe(200);
    expect((((await clients.json()) as { clients: unknown[] }).clients)).toHaveLength(1);

    const usage = await call(app, "/api/superadmin/usage-charges", {
      orgId: "o1",
      amountMinor: 2500,
      description: "Overage",
    });
    expect(usage.status).toBe(201);

    const detail = await app.request("/api/superadmin/clients/o1", {}, ENV);
    expect(detail.status).toBe(200);
  });

  it("lists all invoices with org names", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", type: "usage", status: "paid", amountMinor: 2500 },
      [{ description: "x", amountMinor: 2500 }],
      NOW,
    );
    const app = buildApp(store, BOSS, true);
    const res = await app.request("/api/superadmin/invoices", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoices: Array<{ id: string; orgName: string | null }> };
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toMatchObject({ id: "inv1", orgName: "Acme" });
  });

  it("refunds a paid invoice", async () => {
    const store = memoryStore();
    await store.createInvoice(
      { id: "inv1", orgId: "o1", type: "usage", status: "paid", amountMinor: 5000, tracker: "track_1" },
      [{ description: "x", amountMinor: 5000 }],
      NOW,
    );
    const app = buildApp(store, BOSS, true);
    const res = await call(app, "/api/superadmin/refunds", { invoiceId: "inv1", amountMinor: 1000 });
    expect(res.status).toBe(200);
    expect((await store.getInvoice("inv1"))?.status).toBe("paid");
  });
});

describe("superadmin plans + coupons routes", () => {
  it("enforces the 4-active cap and delete block over HTTP", async () => {
    const store = memoryStore();
    const app = buildApp(store, BOSS, true);
    for (let i = 0; i < 4; i++) {
      const res = await call(app, "/api/superadmin/plans", {
        name: `P${i}`,
        monthlyMinor: 100,
        annualMinor: 1000,
        setupFeeMinor: 0,
      });
      expect(res.status).toBe(201);
    }
    const fifth = await call(app, "/api/superadmin/plans", {
      name: "P5",
      monthlyMinor: 100,
      annualMinor: 1000,
      setupFeeMinor: 0,
    });
    expect(fifth.status).toBe(422);

    const list = (await (await app.request("/api/superadmin/plans", {}, ENV)).json()) as {
      plans: Array<{ id: string }>;
    };
    expect(list.plans).toHaveLength(4);
    const delMissing = await app.request(`/api/superadmin/plans/nope`, { method: "DELETE" }, ENV);
    expect(delMissing.status).toBe(404);
    void list;
  });

  it("creates coupons and rejects duplicates", async () => {    const store = memoryStore();
    const app = buildApp(store, BOSS, true);
    const first = await call(app, "/api/superadmin/coupons", {
      code: "welcome10",
      kind: "percent",
      percentOff: 10,
      duration: "once",
    });
    expect(first.status).toBe(201);
    expect(((await first.json()) as { coupon: { code: string } }).coupon.code).toBe("WELCOME10");
    const dup = await call(app, "/api/superadmin/coupons", {
      code: "WELCOME10",
      kind: "percent",
      percentOff: 10,
      duration: "once",
    });
    expect(dup.status).toBe(409);
  });
});

describe("superadmin analytics", () => {
  it("requires superadmin and returns range aggregates", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "p1", name: "Launch" });
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.subscription({
      id: "s1", orgId: "o1", planId: "p1",
      interval: "month", status: "active",
      startDate: NOW - 5 * 86400, nextCharge: NOW + 25 * 86400, recurringAmountMinor: 19900,
    });
    expect((await buildApp(store, null, false).request("/api/superadmin/analytics", {}, ENV)).status).toBe(401);
    expect((await buildApp(store, BOSS, false).request("/api/superadmin/analytics", {}, ENV)).status).toBe(403);

    const app = buildApp(store, BOSS, true);
    const res = await app.request("/api/superadmin/analytics", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kpis: { mrrMinor: number; activeSubscriptions: number };
      revenueByDay: unknown[];
      subsByPlan: Array<{ planId: string; active: number }>;
    };
    expect(body.kpis.mrrMinor).toBe(19900);
    expect(body.kpis.activeSubscriptions).toBe(1);
    expect(body.revenueByDay).toHaveLength(31); // 30-day window, inclusive calendar days
    expect(body.subsByPlan[0]).toMatchObject({ planId: "p1", active: 1 });

    const bad = await app.request("/api/superadmin/analytics?from=2024-02-01&to=2024-01-01", {}, ENV);
    expect(bad.status).toBe(400);
  });
});

describe("superadmin delete client", () => {
  function seedOrg(store: ReturnType<typeof memoryStore>, orgId: string) {
    store.seed.org({ id: orgId, name: `Org ${orgId}` });
    store.seed.user({ id: `u_${orgId}`, email: `${orgId}@test.com` });
    store.seed.member(orgId, `u_${orgId}`, "admin");
    store.seed.method({ id: `m_${orgId}`, orgId });
    store.seed.customer(orgId, "enc");
    return store.createInvoice(
      { id: `inv_${orgId}`, orgId, type: "recurring", status: "due", amountMinor: 19900 },
      [{ description: "Renewal", amountMinor: 19900 }],
      NOW,
    );
  }

  it("401/403/404 and 409 while a billable subscription exists", async () => {
    const store = memoryStore();
    await seedOrg(store, "o1");
    store.seed.subscription({ id: "s1", orgId: "o1", status: "active", startDate: NOW - 86400, nextCharge: NOW + 86400 });

    expect((await buildApp(store, null, true).request("/api/superadmin/clients/o1", { method: "DELETE" }, ENV)).status).toBe(401);
    expect((await buildApp(store, BOSS, false).request("/api/superadmin/clients/o1", { method: "DELETE" }, ENV)).status).toBe(403);
    const app = buildApp(store, BOSS, true);
    expect((await app.request("/api/superadmin/clients/nope", { method: "DELETE" }, ENV)).status).toBe(404);

    const blocked = await app.request("/api/superadmin/clients/o1", { method: "DELETE" }, ENV);
    expect(blocked.status).toBe(409);
    // Nothing removed.
    expect(await store.getOrganization("o1")).not.toBeNull();
    expect(await store.listInvoicesForOrg("o1")).toHaveLength(1);
  });

  it("deletes the org and all its data once the subscription is gone", async () => {
    const store = memoryStore();
    await seedOrg(store, "o1");
    await seedOrg(store, "o2");
    store.seed.subscription({ id: "s1", orgId: "o1", status: "canceled", startDate: NOW - 86400, nextCharge: NOW - 100, canceledAt: NOW - 50 });

    const app = buildApp(store, BOSS, true);
    const res = await app.request("/api/superadmin/clients/o1", { method: "DELETE" }, ENV);
    expect(res.status).toBe(200);

    expect(await store.getOrganization("o1")).toBeNull();
    expect(await store.listInvoicesForOrg("o1")).toHaveLength(0);
    expect(await store.listPaymentMethods("o1")).toHaveLength(0);
    expect(await store.listOrgMembers("o1")).toHaveLength(0);
    expect(await store.getOrgSubscription("o1")).toBeNull();
    // Other tenant untouched.
    expect(await store.getOrganization("o2")).not.toBeNull();
    expect(await store.listInvoicesForOrg("o2")).toHaveLength(1);
  });
});

describe("superadmin member access", () => {
  it("toggles status, rejects non-members and outsiders", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    store.seed.user({ id: "u1", email: "boss@acme.com" });
    store.seed.user({ id: "u2", email: "staff@acme.com" });
    store.seed.member("o1", "u1", "admin");
    store.seed.member("o1", "u2", "user");
    const app = buildApp(store, BOSS, true);

    const bad = await call(app, "/api/superadmin/clients/o1/members/nope", { status: "suspended" }, "PATCH");
    expect(bad.status).toBe(404);

    const res = await call(app, "/api/superadmin/clients/o1/members/mem_u2_o1", { status: "suspended" }, "PATCH");
    expect(res.status).toBe(200);

    const invalid = await call(app, "/api/superadmin/clients/o1/members/mem_u2_o1", { status: "banned" }, "PATCH");
    expect(invalid.status).toBe(422);

    const outsider = buildApp(store, BOSS, false);
    expect((await call(outsider, "/api/superadmin/clients/o1/members/mem_u2_o1", { status: "active" }, "PATCH")).status).toBe(403);
  });
});

describe("briefing run trigger", () => {
  it("requires a session and the superadmin role", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    const anon = buildApp(store, null, true);
    expect((await call(anon, "/api/superadmin/briefings/run")).status).toBe(401);

    const member = buildApp(store, BOSS, false);
    expect((await call(member, "/api/superadmin/briefings/run")).status).toBe(403);
  });

it("returns a run summary for a superadmin", async () => {
    const store = memoryStore();
    store.seed.org({ id: "o1", name: "Acme" });
    const app = buildApp(store, BOSS, true, emptyDrizzle());
    const res = await call(app, "/api/superadmin/briefings/run", { orgId: "o1" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      actor: string;
      ran: number;
      failed: number;
      skippedGated: number;
      skippedDuplicate: number;
      jobs: unknown[];
    };
    expect(body.actor).toBe("u9");
    expect(body.ran).toBe(0);
    expect(body.jobs).toEqual([]);
  });
});