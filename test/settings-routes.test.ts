import { describe, expect, it } from "vitest";
import { createSuperadminRoutes } from "../src/server/routes/superadmin";
import { createPlansRoutes } from "../src/server/routes/plans";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";

const USER: SessionUser = { id: "u1", email: "user@example.com", emailVerified: true };
const BOSS: SessionUser = { id: "u9", email: "boss@example.com", emailVerified: true };

const fakeCtx = { db: {} as unknown as Db, auth: {} as unknown as Auth };

function settingsApp(session: SessionUser | null, superadmin: boolean, stored: Record<string, string>) {
  const store: MemberStore = {
    getMember: async () => null,
    isSuperadmin: async () => superadmin,
    seedSuperadmins: async () => undefined,
  };
  return createSuperadminRoutes({
    ctx: fakeCtx,
    session: async () => session,
    store,
    settings: {
      getAll: async () => ({ ...stored }),
      set: async (key, value) => {
        stored[key] = value;
      },
    },
  });
}

describe("superadmin settings routes", () => {
  it("401 without a session, 403 for non-superadmins", async () => {
    const anon = settingsApp(null, false, {});
    expect((await anon.request("/api/superadmin/settings")).status).toBe(401);

    const user = settingsApp(USER, false, {});
    expect((await user.request("/api/superadmin/settings")).status).toBe(403);
  });

  it("superadmin reads and updates settings (support email only; name is hardcoded)", async () => {
    const stored = { portal_name: "Old", support_email: "a@x.com" };
    const app = settingsApp(BOSS, true, stored);

    const get = await app.request("/api/superadmin/settings");
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({
      settings: { support_email: "a@x.com" },
    });

    const patch = await app.request("/api/superadmin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ support_email: "b@x.com" }),
    });
    expect(patch.status).toBe(200);
    expect(stored.support_email).toBe("b@x.com");
    expect(stored.portal_name).toBe("Old");

    const rename = await app.request("/api/superadmin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal_name: "New Portal" }),
    });
    expect(rename.status).toBe(422);
  });

  it("422 on invalid settings payload", async () => {
    const app = settingsApp(BOSS, true, {});
    const res = await app.request("/api/superadmin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ support_email: "not-an-email" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("public plans route", () => {
  it("lists injected plans without auth", async () => {
    const app = createPlansRoutes({
      ctx: fakeCtx,
      list: async () => [
        {
          id: "launch",
          name: "Launch",
          monthlyMinor: 19900,
          annualMinor: 199000,
          setupFeeMinor: 49700,
          trialPeriodDays: 0,
          description: null,
          currency: "USD",
          maxUsers: null,
          allowBriefings: 1,
          features: "Unlimited users, 7 AI Advisors",
        },
      ],
    });
    const res = await app.request("/api/plans");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<{ id: string }> };
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0]?.id).toBe("launch");
  });

  it("returns plan features", async () => {
    const app = createPlansRoutes({
      ctx: fakeCtx,
      list: async () => [
        {
          id: "launch",
          name: "Launch",
          monthlyMinor: 19900,
          annualMinor: 199000,
          setupFeeMinor: 0,
          trialPeriodDays: 0,
          description: null,
          currency: "USD",
          maxUsers: null,
          allowBriefings: 1,
          features: "Unlimited users, 7 AI Advisors",
        },
      ],
    });
    const res = await app.request("/api/plans");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<{ id: string; features: string | null }> };
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0]).toMatchObject({ id: "launch", features: "Unlimited users, 7 AI Advisors" });
  });
});
