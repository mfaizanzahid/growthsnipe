import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import { setSetting } from "../src/server/repositories";
import { createDiagnosticRoutes } from "../src/server/routes/diagnostic";

function testDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      const statement = sqlite.prepare(sql);
      const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
      return { rows: objectRows.map((row) => Object.values(row)) };
    },
    { schema },
  );
  return db as unknown as Db;
}

function appFor(db: Db) {
  return createDiagnosticRoutes({ ctx: { db, auth: {} as unknown as Auth } });
}

describe("diagnostic review call redirect", () => {
  it("redirects to the configured URL without caching", async () => {
    const db = testDb();
    await setSetting(db, "diagnostic_review_call_url", "https://calendly.com/team/diagnostic-review");
    const res = await appFor(db).request("/diagnostic-review-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://calendly.com/team/diagnostic-review");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts a root-relative destination", async () => {
    const db = testDb();
    await setSetting(db, "diagnostic_review_call_url", "/contact");
    const res = await appFor(db).request("/diagnostic-review-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/contact");
  });

  it("falls back to /book when unset", async () => {
    const res = await appFor(testDb()).request("/diagnostic-review-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/book");
  });

  it("falls back to /book when the stored target is unsafe", async () => {
    const db = testDb();
    await setSetting(db, "diagnostic_review_call_url", "javascript:alert(1)");
    const res = await appFor(db).request("/diagnostic-review-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/book");
  });

  it("redirects the Blueprint discovery call to its configured URL", async () => {
    const db = testDb();
    await setSetting(db, "blueprint_discovery_call_url", "https://calendly.com/team/blueprint-discovery");
    const res = await appFor(db).request("/blueprint-discovery-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://calendly.com/team/blueprint-discovery");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to /book when the Blueprint discovery URL is unset", async () => {
    const res = await appFor(testDb()).request("/blueprint-discovery-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/book");
  });

  it("falls back to /book when the Blueprint discovery URL is unsafe", async () => {
    const db = testDb();
    await setSetting(db, "blueprint_discovery_call_url", "javascript:alert(1)");
    const res = await appFor(db).request("/blueprint-discovery-call");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/book");
  });

  it("runs both redirects in the Worker before static assets", () => {
    const wrangler = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain('"/diagnostic-review-call"');
    expect(wrangler).toContain('"/blueprint-discovery-call"');
  });
});
