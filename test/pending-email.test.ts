import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingEmailRoutes, type PendingEmailMailer, type PendingEmailStore } from "../src/server/routes/pending-email";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";

const ENV = {} as unknown as Env;

interface FakeUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

function buildApp(users: FakeUser[], opts: { lastSent?: number | null } = {}) {
  const sent: string[] = [];
  const changed: Array<{ userId: string; oldEmail: string; newEmail: string }> = [];
  const store: PendingEmailStore = {
    async findByEmail(email) {
      return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async emailTakenByOther(email, exceptUserId) {
      return users.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== exceptUserId);
    },
    async lastVerificationSentAt() {
      return opts.lastSent ?? null;
    },
    async changeEmail(userId, oldEmail, newEmail) {
      const user = users.find((u) => u.id === userId);
      if (user) user.email = newEmail;
      changed.push({ userId, oldEmail, newEmail });
    },
  };
  const mailer: PendingEmailMailer = {
    async sendVerificationEmail(email) {
      sent.push(email);
    },
  };
  const app = createPendingEmailRoutes({
    ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
    store,
    mailer,
  });
  return { app, sent, changed };
}

function req(app: ReturnType<typeof createPendingEmailRoutes>, body: unknown) {
  return app.request(
    "/api/pending-email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    ENV,
  );
}

describe("pending-email route", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves an unverified address and sends a fresh link", async () => {
    const { app, sent, changed } = buildApp([{ id: "u1", email: "old@test.com", emailVerified: false }]);
    const res = await req(app, { currentEmail: "old@test.com", newEmail: "new@test.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, email: "new@test.com" });
    expect(changed).toHaveLength(1);
    expect(sent).toEqual(["new@test.com"]);
  });

  it("returns generic success for unknown addresses (no enumeration oracle)", async () => {
    const { app, sent, changed } = buildApp([]);
    const res = await req(app, { currentEmail: "ghost@test.com", newEmail: "new@test.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(changed).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("refuses already-verified addresses", async () => {
    const { app, sent } = buildApp([{ id: "u1", email: "done@test.com", emailVerified: true }]);
    const res = await req(app, { currentEmail: "done@test.com", newEmail: "other@test.com" });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("refuses an address that is already in use", async () => {
    const { app, sent } = buildApp([
      { id: "u1", email: "old@test.com", emailVerified: false },
      { id: "u2", email: "taken@test.com", emailVerified: true },
    ]);
    const res = await req(app, { currentEmail: "old@test.com", newEmail: "taken@test.com" });
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("enforces the per-address cooldown", async () => {
    const { app, sent } = buildApp([{ id: "u1", email: "old@test.com", emailVerified: false }], {
      lastSent: Date.now(),
    });
    const res = await req(app, { currentEmail: "old@test.com", newEmail: "new@test.com" });
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(0);
  });

  it("rejects invalid payloads", async () => {
    const { app } = buildApp([]);
    expect((await req(app, { currentEmail: "not-an-email", newEmail: "new@test.com" })).status).toBe(422);
    expect((await req(app, { currentEmail: "a@test.com", newEmail: "a@test.com" })).status).toBe(422);
    expect((await req(app, {})).status).toBe(422);
  });
});

describe("account-exists route", () => {
  async function check(app: ReturnType<typeof createPendingEmailRoutes>, body: unknown) {
    return app.request(
      "/api/account-exists",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      ENV,
    );
  }

  it("reports true only for verified accounts", async () => {
    const { app } = buildApp([
      { id: "u1", email: "done@test.com", emailVerified: true },
      { id: "u2", email: "pending@test.com", emailVerified: false },
    ]);
    expect(await (await check(app, { email: "done@test.com" })).json()).toEqual({ exists: true });
    expect(await (await check(app, { email: "DONE@test.com" })).json()).toEqual({ exists: true });
    expect(await (await check(app, { email: "pending@test.com" })).json()).toEqual({ exists: false });
    expect(await (await check(app, { email: "ghost@test.com" })).json()).toEqual({ exists: false });
  });

  it("rejects invalid payloads", async () => {
    const { app } = buildApp([]);
    expect((await check(app, { email: "not-an-email" })).status).toBe(422);
    expect((await check(app, {})).status).toBe(422);
  });
});
