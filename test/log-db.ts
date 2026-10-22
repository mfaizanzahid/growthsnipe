import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";

/**
 * A real in-memory SQLite database behind Drizzle's sqlite-proxy driver.
 *
 * Using the same SQL engine as D1 means the query builder, the LIKE
 * matching, the ordering and the pagination are all exercised for real -
 * a hand-written Drizzle stub would only test the stub.
 */
export function memoryLogDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE app_logs (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      surface TEXT NOT NULL,
      message TEXT NOT NULL,
      path TEXT,
      method TEXT,
      status_code INTEGER,
      user_id TEXT,
      user_email TEXT,
      org_id TEXT,
      org_name TEXT,
      ip TEXT,
      user_agent TEXT,
      request_id TEXT,
      detail_json TEXT,
      city TEXT,
      country TEXT
    );
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      logo TEXT,
      metadata TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      default_org_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE members (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      member_status TEXT NOT NULL DEFAULT 'active',
      suspended_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      const statement = sqlite.prepare(sql);
      // drizzle's sqlite-proxy maps results positionally, so rows must be
      // arrays (like D1's raw() output), not objects. node:sqlite has no
      // raw() helper, so convert using the row's own key order, which
      // follows the SELECT column order.
      const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
      const rows = objectRows.map((row) => Object.values(row));
      return { rows };
    },
    { schema },
  );

  return { db: db as unknown as Db, sqlite };
}
