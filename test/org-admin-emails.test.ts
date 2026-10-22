import { describe, expect, it } from "vitest";
import { memoryLogDb } from "./log-db";
import { listOrgAdminEmails } from "../src/server/repositories/billing";

/**
 * The audience for every transactional email (briefings, renewals, dunning,
 * invoices, refunds) is the org's ACTIVE admins. A suspended member cannot
 * use the product, and a manual suspension usually means the person left, so
 * they must not keep receiving org email.
 */
describe("listOrgAdminEmails", () => {
  function seed(
    sqlite: ReturnType<typeof memoryLogDb>["sqlite"],
    rows: Array<{ id: string; email: string; role: string; status: string }>,
  ) {
    const now = Date.UTC(2026, 9, 20);
    for (const r of rows) {
      sqlite
        .prepare(
          `INSERT INTO users (id, email, email_verified, is_superadmin, created_at, updated_at)
           VALUES (?, ?, 1, 0, ?, ?)`,
        )
        .run(`u-${r.id}`, r.email, now, now);
      sqlite
        .prepare(
          `INSERT INTO members (id, org_id, user_id, role, member_status, created_at, updated_at)
           VALUES (?, 'o1', ?, ?, ?, ?, ?)`,
        )
        .run(`m-${r.id}`, `u-${r.id}`, r.role, r.status, now, now);
    }
  }

  it("returns only active admins", async () => {
    const { db, sqlite } = memoryLogDb();
    seed(sqlite, [
      { id: "a", email: "active@test.com", role: "admin", status: "active" },
      { id: "b", email: "suspended@test.com", role: "admin", status: "suspended" },
      { id: "c", email: "member@test.com", role: "user", status: "active" },
    ]);

    const admins = await listOrgAdminEmails(db, "o1");
    expect(admins).toEqual(["active@test.com"]);
  });

  it("does not leak another workspace's admins", async () => {
    const { db, sqlite } = memoryLogDb();
    const now = Date.UTC(2026, 9, 20);
    sqlite
      .prepare(
        `INSERT INTO users (id, email, email_verified, is_superadmin, created_at, updated_at)
         VALUES ('u-x', 'other@test.com', 1, 0, ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO members (id, org_id, user_id, role, member_status, created_at, updated_at)
         VALUES ('m-x', 'o2', 'u-x', 'admin', 'active', ?, ?)`,
      )
      .run(now, now);
    seed(sqlite, [{ id: "a", email: "mine@test.com", role: "admin", status: "active" }]);

    const admins = await listOrgAdminEmails(db, "o1");
    expect(admins).toEqual(["mine@test.com"]);
  });
});
