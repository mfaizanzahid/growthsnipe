import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import { encryptSecret } from "../src/server/lib/crypto";
import { captureEmails } from "../src/server/lib/email";
import { memoryStore, setStoreClock } from "./memory-store";
import { createBillingRoutes } from "../src/server/routes/billing";
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
  SAFEPAY_ENV: "sandbox",
  SAFEPAY_DEFAULT_COUNTRY: "US",
  RESEND_API_KEY: "re_test",
} as unknown as Env;

const USER: SessionUser = { id: "u1", email: "buyer@test.com", emailVerified: true };
const NOW = 2_000_000_000;

function fakeGateway(): Gateway {
  return {
    createCustomer: async () => "cus_test",
    createPaymentSession: async () => "track_sess_1",
    createClientAuthToken: async () => "tbt_test",
    chargeSavedCard: async (input) => {
      if (input.paymentMethodToken === "pm_bad") throw new Error("declined");
      return { tracker: "track_c", chargeId: "ch_c" };
    },
    listWallet: async () => [{ token: "pm_new", last4: "4242" }],
    checkTrackerStatus: async () => "succeeded",
    refund: async () => ({ gatewayReference: "track_x" }),
  };
}

function memberStore(role = "admin", superadmin = false): MemberStore {
  return {
    getMember: async (orgId, userId) =>
      !superadmin && (orgId === "o1" || orgId === "o2") && userId === "u1" ? { role } : null,
    isSuperadmin: async () => superadmin,
    seedSuperadmins: async () => undefined,
  };
}

function buildApp(store: ReturnType<typeof memoryStore>, userOrgs: Array<{ id: string }> = [], role = "admin", superadmin = false) {
  return createBillingRoutes({
    gateway: fakeGateway(),
    session: async () => USER,
    store: memberStore(role, superadmin),
    billing: store,
    idem: store,
    userOrgs: async () => userOrgs,
    ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
  });
}

function req(app: ReturnType<typeof buildApp>, path: string, body?: unknown, method = "POST") {
  return app.request(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    ENV,
  );
}

beforeEach(() => {
  captureEmails();
  setStoreClock(NOW * 1000);
});

describe("billing session + signup routes", () => {
  it("computes the session amount server-side (coupon applied)", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch" });
    store.seed.coupon({ id: "c1", code: "SAVE20", kind: "percent", percentOff: 20, duration: "once" });
    const app = buildApp(store);
    const res = await req(app, "/api/billing/session", {
      orgId: "o1",
      purpose: "signup",
      planId: "launch",
      interval: "month",
      couponCode: "SAVE20",
      phone: "+923001234567",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { amountMinor: number; tracker: string };
    expect(body.amountMinor).toBe(15920);
    expect(body.tracker).toBe("track_sess_1");
  });

  it("requires a phone number for first-time customers", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch" });
    const app = buildApp(store);
    const res = await req(app, "/api/billing/session", {
      orgId: "o1",
      purpose: "signup",
      planId: "launch",
      interval: "month",
    });
    expect(res.status).toBe(422);
  });

  it("confirms signup and caches repeats", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch" });
    store.seed.customer("o1", await encryptSecret("cus_1", KEY));
    store.seed.session({ tracker: "track_1", orgId: "o1", amountMinor: 19900 });
    const app = buildApp(store);
    const payload = { orgId: "o1", planId: "launch", interval: "month", tracker: "track_1" };
    const first = await req(app, "/api/billing/signup", payload);
    expect(first.status).toBe(201);
    const second = await req(app, "/api/billing/signup", payload);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { cached: boolean }).cached).toBe(true);
  });
});

describe("billing methods routes", () => {  it("confirms a card save and manages primary/remove rules", async () => {
    const store = memoryStore();
    store.seed.customer("o1", await encryptSecret("cus_1", KEY));
    store.seed.session({ tracker: "track_setup", orgId: "o1", amountMinor: 0, purpose: "setup" });
    const app = buildApp(store);

    const confirm = await req(app, "/api/billing/methods/confirm", { orgId: "o1", tracker: "track_setup" });
    expect(confirm.status).toBe(200);
    const listed = (await (await app.request("/api/billing/methods?orgId=o1", { headers: {} }, ENV)).json()) as {
      methods: Array<{ id: string; last4: string | null; isDefault: boolean }>;
    };
    expect(listed.methods).toHaveLength(1);
    expect(listed.methods[0]?.isDefault).toBe(true);

    // Cannot remove the last valid method.
    const del = await app.request(`/api/billing/methods/${listed.methods[0]?.id}?orgId=o1`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "o1" }),
    }, ENV);
    expect(del.status).toBe(409);
  });
});

describe("billing invoices + subscription routes", () => {
  it("pays, downloads pdf, changes and cancels", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "launch", name: "Launch" });
    store.seed.customer("o1", await encryptSecret("cus_1", KEY));
    store.seed.method({ id: "m1", orgId: "o1", isDefault: 1, safepayPaymentMethodTokenEncrypted: await encryptSecret("pm_good", KEY) });
    store.seed.subscription({ id: "s1", orgId: "o1", planId: "launch", nextCharge: NOW + 20 * 86400 });
    await store.createInvoice(
      { id: "inv1", orgId: "o1", subscriptionId: "s1", type: "subscription", status: "failed", amountMinor: 19900 },
      [{ description: "renewal", amountMinor: 19900 }],
      NOW - 100,
    );
    const app = buildApp(store);

    const pay = await req(app, "/api/billing/invoices/inv1/pay", { orgId: "o1" });
    expect(pay.status).toBe(200);

    const pdf = await app.request("/api/billing/invoices/inv1/pdf?orgId=o1", { headers: {} }, ENV);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");

    const sub = (await (await app.request("/api/billing/subscription?orgId=o1", { headers: {} }, ENV)).json()) as {
      subscription: { status: string } | null;
    };
    expect(sub.subscription?.status).toBe("active");

    const cancel = await req(app, "/api/billing/subscription/cancel", { orgId: "o1" });
    expect(cancel.status).toBe(200);
  });
});

describe("error hygiene", () => {
  it("never leaks gateway internals on unexpected failures", async () => {
    const { createBillingRoutes } = await import("../src/server/routes/billing");
    const store = memoryStore();
    const app = createBillingRoutes({
      gateway: {
        createCustomer: async () => {
          throw new Error("Safepay error 400: SECRET_leak");
        },
        createPaymentSession: async () => "x",
        createClientAuthToken: async () => "x",
        chargeSavedCard: async () => ({ tracker: "x", chargeId: "y" }),
        listWallet: async () => [],
        checkTrackerStatus: async () => "succeeded",
        refund: async () => ({ gatewayReference: "x" }),
      },
      session: async () => USER,
      store: {
        getMember: async () => ({ role: "admin" }),
        isSuperadmin: async () => false,
        seedSuperadmins: async () => undefined,
      },
      billing: store,
      idem: store,
      ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
    });
    const res = await app.request(
      "/api/billing/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: "o1", purpose: "setup", phone: "+15550001111" }),
      },
      ENV,
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Request failed");
    expect(body.error).not.toContain("SECRET");
  });
});

describe("admin-only access", () => {
  it.each(["user", "viewer"])("forbids billing reads and writes for role %s", async (role) => {
    const store = memoryStore();
    const app = buildApp(store, [], role);
    expect((await app.request("/api/billing/methods?orgId=o1", { headers: {} }, ENV)).status).toBe(403);
    expect((await app.request("/api/billing/invoices?orgId=o1", { headers: {} }, ENV)).status).toBe(403);
    expect((await app.request("/api/billing/subscription?orgId=o1", { headers: {} }, ENV)).status).toBe(403);
    expect((await req(app, "/api/billing/invoices/inv1/pay", { orgId: "o1" })).status).toBe(403);
    expect((await req(app, "/api/billing/trial/start", { orgId: "o1" })).status).toBe(403);
  });

  it("lets superadmins operate tenant billing without membership", async () => {
    const store = memoryStore();
    const app = buildApp(store, [], "viewer", true);
    expect((await app.request("/api/billing/methods?orgId=o1", { headers: {} }, ENV)).status).toBe(200);
    expect((await app.request("/api/billing/subscription?orgId=o1", { headers: {} }, ENV)).status).toBe(200);
  });
});

describe("trial start + subscribe routes", () => {
  it("starts a trial for a first workspace, rejects repeats and second workspaces", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "pro", name: "Pro" });
    const app = buildApp(store);
    const first = await req(app, "/api/billing/trial/start", { orgId: "o1" });
    expect(first.status).toBe(201);
    const repeat = await req(app, "/api/billing/trial/start", { orgId: "o1" });
    expect(repeat.status).toBe(409);
    const second = buildApp(store, [{ id: "o1" }, { id: "o2" }]);
    expect((await req(second, "/api/billing/trial/start", { orgId: "o2" })).status).toBe(409);
  });

  it("subscribes with first-period charge and caches repeats", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "starter", name: "Starter", monthlyMinor: 1900 });
    const { encryptSecret } = await import("../src/server/lib/crypto");
    store.seed.customer("o1", await encryptSecret("cus_1", KEY));
    store.seed.session({ tracker: "track_sub", orgId: "o1", amountMinor: 1900 });
    const app = buildApp(store);
    const payload = { orgId: "o1", planId: "starter", interval: "month", tracker: "track_sub" };
    const first = await req(app, "/api/billing/subscribe", payload);
    expect(first.status).toBe(201);
    const second = await req(app, "/api/billing/subscribe", payload);
    expect([200, 409]).toContain(second.status);
  });

  it("keeps a trial on the trial tier and blocks a plan change until it starts", async () => {
    const store = memoryStore();
    store.seed.plan({ id: "starter", name: "Starter", monthlyMinor: 1900 });
    store.seed.plan({ id: "pro", name: "Pro", monthlyMinor: 2900, maxUsers: null, allowBriefings: 1 });
    const { encryptSecret } = await import("../src/server/lib/crypto");
    store.seed.customer("o1", await encryptSecret("cus_1", KEY));
    store.seed.session({ tracker: "track_sub", orgId: "o1", amountMinor: 1900 });
    const app = buildApp(store);

    expect((await req(app, "/api/billing/trial/start", { orgId: "o1" })).status).toBe(201);
    const res = await req(app, "/api/billing/subscribe", {
      orgId: "o1",
      planId: "starter",
      interval: "month",
      tracker: "track_sub",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { prepaid: boolean; planStartsAt: number | null; nextCharge: number };
    expect(body.prepaid).toBe(true);
    expect(body.planStartsAt).toBeGreaterThan(0);

    // The subscription payload tells the client when the plan starts.
    const sub = (await (await req(app, "/api/billing/subscription?orgId=o1", undefined, "GET")).json()) as {
      subscription: { status: string; trialPrepaid: number; nextCharge: number };
      planStartsAt: number | null;
    };
    expect(sub.subscription.status).toBe("trialing");
    expect(sub.subscription.trialPrepaid).toBe(1);
    expect(sub.planStartsAt).toBe(body.planStartsAt);
    // The renewal follows the trial, not the day they subscribed.
    expect(sub.subscription.nextCharge).toBeGreaterThan(body.planStartsAt as number);

    // A plan change would charge a second time for a period already paid.
    const change = await req(app, "/api/billing/subscription/change", {
      orgId: "o1",
      planId: "pro",
      interval: "month",
    });
    expect(change.status).toBe(409);
  });
});
