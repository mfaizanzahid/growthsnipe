import { describe, expect, it } from "vitest";
import {
  purgeAppLogs,
  queryAppLogs,
  redactDetail,
  requestGeo,
  retentionDays,
  writeAppLog,
} from "../src/server/lib/app-logs";
import { memoryLogDb } from "./log-db";
import type { Db } from "../src/server/repositories/db";
import type { DatabaseSync } from "node:sqlite";

/** Insert a log row with an explicit timestamp (so ordering is testable). */
function insertLog(sqlite: DatabaseSync, event: string, createdAt: number): void {
  sqlite
    .prepare(
      `INSERT INTO app_logs (id, created_at, level, event, surface, message)
       VALUES (?, ?, 'info', ?, 'api', ?)`,
    )
    .run(`${event}-${createdAt}`, createdAt, event, `message for ${event}`);
}

describe("requestGeo", () => {
  it("reads the city and country Cloudflare resolved from the client IP", () => {
    const request = new Request("https://example.com", {
      // `cf` is added by the edge at runtime, not by the Request constructor.
    }) as Request & { cf?: { city?: string; country?: string } };
    request.cf = { city: "Austin", country: "US" };
    expect(requestGeo(request)).toEqual({ city: "Austin", country: "US" });
  });

  it("is null-safe when the runtime provides no geo", () => {
    expect(requestGeo(new Request("https://example.com"))).toEqual({
      city: null,
      country: null,
    });
  });
});

describe("writeAppLog", () => {
  it("stores the event with its fields", async () => {
    const { db, sqlite } = memoryLogDb();
    await writeAppLog(db, {
      level: "error",
      event: "http.5xx",
      surface: "api",
      message: "GET /api/x returned 500",
      path: "/api/x",
      method: "GET",
      statusCode: 500,
      userId: "u1",
      userEmail: "a@b.com",
      orgId: "o1",
      ip: "1.2.3.4",
      userAgent: "vitest",
      requestId: "ray-1",
    });
    const row = sqlite.prepare("SELECT * FROM app_logs").get() as Record<string, unknown>;
    expect(row.event).toBe("http.5xx");
    expect(row.level).toBe("error");
    expect(row.surface).toBe("api");
    expect(row.message).toBe("GET /api/x returned 500");
    expect(row.user_email).toBe("a@b.com");
    expect(row.status_code).toBe(500);
    expect(row.ip).toBe("1.2.3.4");
  });

  it("defaults the level to info", async () => {
    const { db, sqlite } = memoryLogDb();
    await writeAppLog(db, { event: "cron.renewals", surface: "cron", message: "ok" });
    const row = sqlite.prepare("SELECT level FROM app_logs").get() as { level: string };
    expect(row.level).toBe("info");
  });

  it("never throws when the database fails", async () => {
    const broken = {
      insert: () => ({ values: () => Promise.reject(new Error("d1 down")) }),
    } as unknown as Db;
    await expect(
      writeAppLog(broken, { event: "x", surface: "api", message: "y" }),
    ).resolves.toBeUndefined();
  });

  it("redacts secret-bearing detail keys", async () => {
    const { db, sqlite } = memoryLogDb();
    await writeAppLog(db, {
      event: "test",
      surface: "api",
      message: "msg",
      detail: { password: "p", token: "t", nested: { apiKey: "k", safe: 1 } },
    });
    const row = sqlite.prepare("SELECT detail_json FROM app_logs").get() as {
      detail_json: string;
    };
    const detail = JSON.parse(row.detail_json);
    expect(detail.password).toBe("[redacted]");
    expect(detail.token).toBe("[redacted]");
    expect(detail.nested.apiKey).toBe("[redacted]");
    expect(detail.nested.safe).toBe(1);
  });

  it("stores no detail column when detail is absent", async () => {
    const { db, sqlite } = memoryLogDb();
    await writeAppLog(db, { event: "test", surface: "api", message: "msg" });
    const row = sqlite.prepare("SELECT detail_json FROM app_logs").get() as {
      detail_json: string | null;
    };
    expect(row.detail_json).toBeNull();
  });
});

describe("redactDetail", () => {
  it("redacts nested sensitive keys and keeps the rest", () => {
    const result = redactDetail({
      user: { password: "p", name: "n" },
      token: "t",
    }) as Record<string, unknown>;
    const user = result.user as Record<string, unknown>;
    expect(user.password).toBe("[redacted]");
    expect(user.name).toBe("n");
    expect(result.token).toBe("[redacted]");
  });

  it("summarizes Error objects", () => {
    const result = redactDetail(new Error("boom")) as Record<string, unknown>;
    expect(result.message).toBe("boom");
    expect(typeof result.stack).toBe("string");
  });

  it("truncates deep nesting", () => {
    const result = redactDetail({ a: { b: { c: { d: { e: "x" } } } } }) as Record<string, unknown>;
    const a = result.a as Record<string, unknown>;
    const b = a.b as Record<string, unknown>;
    const c = b.c as Record<string, unknown>;
    expect(c.d).toBe("[truncated]");
  });

  it("caps array length", () => {
    const result = redactDetail(Array.from({ length: 50 }, (_, i) => i)) as unknown[];
    expect(result).toHaveLength(20);
  });
});

describe("retentionDays", () => {
  it("defaults to 90", () => {
    expect(retentionDays({})).toBe(90);
  });

  it("reads the env override", () => {
    expect(retentionDays({ LOG_RETENTION_DAYS: "30" })).toBe(30);
  });

  it("clamps to at most 3650 days", () => {
    expect(retentionDays({ LOG_RETENTION_DAYS: "99999" })).toBe(3650);
  });

  it("falls back to 90 on a non-numeric value", () => {
    expect(retentionDays({ LOG_RETENTION_DAYS: "abc" })).toBe(90);
  });

  it("falls back to 90 on a zero or negative value", () => {
    expect(retentionDays({ LOG_RETENTION_DAYS: "0" })).toBe(90);
    expect(retentionDays({ LOG_RETENTION_DAYS: "-5" })).toBe(90);
  });
});

describe("queryAppLogs", () => {
  it("returns rows newest first with pagination metadata", async () => {
    const { db, sqlite } = memoryLogDb();
    insertLog(sqlite, "e1", 1_000);
    insertLog(sqlite, "e2", 2_000);
    insertLog(sqlite, "e3", 3_000);

    const page1 = await queryAppLogs(db, { limit: 2, page: 1 });
    expect(page1.logs).toHaveLength(2);
    expect(page1.logs[0]!.event).toBe("e3");
    expect(page1.logs[1]!.event).toBe("e2");
    expect(page1.total).toBe(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);

    const page2 = await queryAppLogs(db, { limit: 2, page: 2 });
    expect(page2.logs).toHaveLength(1);
    expect(page2.logs[0]!.event).toBe("e1");
    expect(page2.hasMore).toBe(false);
  });

  it("keeps paging stable when rows share a timestamp", async () => {
    const { db, sqlite } = memoryLogDb();
    // Same millisecond: ordering must still be deterministic so a row never
    // appears on two pages or on none.
    insertLog(sqlite, "a", 1_000);
    insertLog(sqlite, "b", 1_000);
    insertLog(sqlite, "c", 1_000);
    insertLog(sqlite, "d", 1_000);

    const page1 = await queryAppLogs(db, { limit: 2, page: 1 });
    const page2 = await queryAppLogs(db, { limit: 2, page: 2 });
    const ids = [...page1.logs, ...page2.logs].map((l) => l.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("filters by level", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, { event: "e1", surface: "api", message: "ok", level: "info" });
    await writeAppLog(db, { event: "e2", surface: "api", message: "bad", level: "error" });

    const result = await queryAppLogs(db, { level: "error" });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]!.event).toBe("e2");
    expect(result.total).toBe(1);
  });

  it("filters by surface", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, { event: "e1", surface: "api", message: "ok" });
    await writeAppLog(db, { event: "e2", surface: "cron", message: "tick" });

    const result = await queryAppLogs(db, { surface: "cron" });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]!.event).toBe("e2");
  });

  it("searches free text across message, event, email, org and path", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, {
      event: "auth.login",
      surface: "auth",
      message: "user signed in",
      userEmail: "a@b.com",
    });
    await writeAppLog(db, {
      event: "api.call",
      surface: "api",
      message: "something else",
      orgName: "Acme",
      path: "/api/plans",
    });

    expect((await queryAppLogs(db, { q: "login" })).logs).toHaveLength(1);
    expect((await queryAppLogs(db, { q: "acme" })).logs).toHaveLength(1);
    expect((await queryAppLogs(db, { q: "a@b.com" })).logs).toHaveLength(1);
    expect((await queryAppLogs(db, { q: "/api/plans" })).logs).toHaveLength(1);
    expect((await queryAppLogs(db, { q: "nothing-matches" })).logs).toHaveLength(0);
  });

  it("combines search with a level filter", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, { event: "e1", surface: "api", message: "boom", level: "error" });
    await writeAppLog(db, { event: "e2", surface: "api", message: "boom", level: "info" });

    const result = await queryAppLogs(db, { q: "boom", level: "error" });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]!.event).toBe("e1");
  });

  it("filters by date range", async () => {
    const { db } = memoryLogDb();
    const now = Date.now();
    await writeAppLog(db, { event: "old", surface: "api", message: "old" });
    await writeAppLog(db, { event: "new", surface: "api", message: "new" });

    const result = await queryAppLogs(db, { from: now + 60_000 });
    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("maps a row to the API shape", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, {
      event: "test.event",
      surface: "api",
      message: "hello",
      userId: "u1",
      userEmail: "a@b.com",
      orgId: "o1",
      orgName: "Acme",
      statusCode: 200,
      path: "/api/test",
      method: "GET",
      detail: { ok: true },
    });

    const result = await queryAppLogs(db, {});
    expect(result.logs).toHaveLength(1);
    const log = result.logs[0]!;
    expect(log.id).toBeTruthy();
    expect(new Date(log.createdAt).toString()).not.toBe("Invalid Date");
    expect(log.event).toBe("test.event");
    expect(log.surface).toBe("api");
    expect(log.message).toBe("hello");
    expect(log.userId).toBe("u1");
    expect(log.userEmail).toBe("a@b.com");
    expect(log.orgId).toBe("o1");
    expect(log.orgName).toBe("Acme");
    expect(log.statusCode).toBe(200);
    expect(log.path).toBe("/api/test");
    expect(log.method).toBe("GET");
    expect(log.detail).toEqual({ ok: true });
  });

  it("clamps the limit and page", async () => {
    const { db } = memoryLogDb();
    const result = await queryAppLogs(db, { limit: 5000, page: -3 });
    expect(result.limit).toBe(100);
    expect(result.page).toBe(1);
  });
});

describe("purgeAppLogs", () => {
  it("deletes rows older than the cutoff and keeps recent ones", async () => {
    const { db, sqlite } = memoryLogDb();
    const old = Date.now() - 200 * 24 * 60 * 60 * 1000;
    sqlite
      .prepare(
        `INSERT INTO app_logs (id, created_at, level, event, surface, message) VALUES (?, ?, 'info', 'old', 'api', 'old')`,
      )
      .run("old-1", old);
    await writeAppLog(db, { event: "fresh", surface: "api", message: "fresh" });

    const removed = await purgeAppLogs(db, 90);
    expect(removed).toBe(1);
    const remaining = sqlite.prepare("SELECT id FROM app_logs").all() as { id: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).not.toBe("old-1");
  });

  it("removes nothing when every row is recent", async () => {
    const { db } = memoryLogDb();
    await writeAppLog(db, { event: "fresh", surface: "api", message: "fresh" });
    expect(await purgeAppLogs(db, 90)).toBe(0);
  });
});
