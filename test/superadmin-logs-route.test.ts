import { describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import { createSuperadminRoutes } from "../src/server/routes/superadmin";
import type { MemberStore, SessionUser } from "../src/server/middleware";
import type { Auth } from "../src/server/auth";
import { memoryLogDb } from "./log-db";
import { writeAppLog } from "../src/server/lib/app-logs";

const ENV = {
  TOKEN_ENCRYPTION_KEY: "test-key",
  SAFEPAY_PUBLIC_KEY: "pk_test",
  SAFEPAY_SECRET_KEY: "sk_test",
  SAFEPAY_API_BASE: "https://sandbox.api.getsafepay.com",
  RESEND_API_KEY: "re_test",
} as unknown as Env;

const BOSS: SessionUser = { id: "u9", email: "boss@test.com", emailVerified: true };

function buildApp(session: SessionUser | null, superadmin: boolean, db: unknown) {
  const memberStore: MemberStore = {
    getMember: async () => null,
    isSuperadmin: async () => superadmin,
    seedSuperadmins: async () => undefined,
  };
  return createSuperadminRoutes({
    session: async () => session,
    store: memberStore,
    ctx: { db: db as never, auth: {} as unknown as Auth },
  });
}

describe("GET /api/superadmin/logs", () => {
  it("401 without a session and 403 for non-superadmins", async () => {
    const { db } = memoryLogDb();
    expect(
      (await buildApp(null, false, db).request("/api/superadmin/logs", {}, ENV)).status,
    ).toBe(401);
    expect(
      (await buildApp(BOSS, false, db).request("/api/superadmin/logs", {}, ENV)).status,
    ).toBe(403);
  });

  it("returns the log page for a superadmin", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, {
      level: "error",
      event: "http.5xx",
      surface: "api",
      message: "GET /api/x returned 500",
      statusCode: 500,
    });

    const res = await buildApp(BOSS, true, db).request("/api/superadmin/logs", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: Array<{ event: string; level: string }>;
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]!.event).toBe("http.5xx");
    expect(body.logs[0]!.level).toBe("error");
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("filters by level and surface", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, { event: "e1", surface: "api", message: "ok", level: "info" });
    await writeAppLog(db, { event: "e2", surface: "cron", message: "tick", level: "error" });

    const res = await buildApp(BOSS, true, db).request(
      "/api/superadmin/logs?surface=cron",
      {},
      ENV,
    );
    const body = (await res.json()) as { logs: Array<{ event: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.logs[0]!.event).toBe("e2");
  });

  it("rejects an unknown surface with 422", async () => {
    const { db } = memoryLogDb();
    const res = await buildApp(BOSS, true, db).request(
      "/api/superadmin/logs?surface=nope",
      {},
      ENV,
    );
    expect(res.status).toBe(422);
  });

  it("rejects a malformed date filter with 422", async () => {
    const { db } = memoryLogDb();
    const res = await buildApp(BOSS, true, db).request(
      "/api/superadmin/logs?from=not-a-date",
      {},
      ENV,
    );
    expect(res.status).toBe(422);
  });

  it("rejects an out-of-range page with 422", async () => {
    const { db } = memoryLogDb();
    const res = await buildApp(BOSS, true, db).request(
      "/api/superadmin/logs?page=0",
      {},
      ENV,
    );
    expect(res.status).toBe(422);
  });

  it("returns the request origin (city, country)", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, {
      event: "http.5xx",
      surface: "api",
      message: "boom",
      city: "Austin",
      country: "US",
    });

    const res = await buildApp(BOSS, true, db).request("/api/superadmin/logs", {}, ENV);
    const body = (await res.json()) as { logs: Array<{ city: string | null; country: string | null }> };
    expect(body.logs[0]!.city).toBe("Austin");
    expect(body.logs[0]!.country).toBe("US");
  });
});

describe("DELETE /api/superadmin/logs", () => {
  function deleteReq(app: ReturnType<typeof buildApp>, ids: unknown) {
    return app.request(
      "/api/superadmin/logs",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      },
      ENV,
    );
  }

  it("401 without a session and 403 for non-superadmins", async () => {
    const { db } = memoryLogDb();
    expect((await deleteReq(buildApp(null, false, db), ["a"])).status).toBe(401);
    expect((await deleteReq(buildApp(BOSS, false, db), ["a"])).status).toBe(403);
  });

  it("deletes the selected rows and leaves the others", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, { event: "e1", surface: "api", message: "one" });
    await writeAppLog(db, { event: "e2", surface: "api", message: "two" });
    await writeAppLog(db, { event: "e3", surface: "api", message: "three" });

    const listed = (await (
      await buildApp(BOSS, true, db).request("/api/superadmin/logs", {}, ENV)
    ).json()) as { logs: Array<{ id: string; event: string }> };
    const target = listed.logs.find((l) => l.event === "e2")!;

    const res = await deleteReq(buildApp(BOSS, true, db), [target.id]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deleted: number }).deleted).toBe(1);

    const after = (await (
      await buildApp(BOSS, true, db).request("/api/superadmin/logs", {}, ENV)
    ).json()) as { logs: Array<{ event: string }> };
    expect(after.logs.map((l) => l.event).sort()).toEqual(["e1", "e3"]);
  });

  it("rejects an empty or malformed id list with 422", async () => {
    const { db } = memoryLogDb();
    expect((await deleteReq(buildApp(BOSS, true, db), [])).status).toBe(422);
    expect((await deleteReq(buildApp(BOSS, true, db), "nope")).status).toBe(422);
  });
});
