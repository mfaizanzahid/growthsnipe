import { and, eq, inArray, sql } from "drizzle-orm";
import {
  appSettings,
  members,
  organizations,
  users,
} from "../../../db/schema";
import type { Db } from "./db";
import { nowMs } from "../lib/time";

export async function getUserById(db: Db, id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Idempotently flag matching emails as superadmin. Returns affected count. */
export async function seedSuperadmins(db: Db, emails: string[]): Promise<number> {
  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return 0;
  await db
    .update(users)
    .set({ isSuperadmin: 1, updatedAt: new Date() })
    .where(
      and(inArray(sql`lower(${users.email})`, normalized), eq(users.isSuperadmin, 0)),
    );
  return normalized.length;
}

export async function isSuperadmin(db: Db, userId: string): Promise<boolean> {
  const user = await getUserById(db, userId);
  return (user?.isSuperadmin ?? 0) === 1;
}

export interface OrgMembership {
  id: string;
  name: string;
  slug: string | null;
  role: string;
}

export async function listOrgsForUser(db: Db, userId: string): Promise<OrgMembership[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: members.role,
    })
    .from(members)
    .innerJoin(organizations, eq(members.orgId, organizations.id))
    .where(eq(members.userId, userId));
  return rows;
}

export async function getMember(db: Db, orgId: string, userId: string) {
  const rows = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function getAllSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  const now = nowMs();
  const existing = await getSetting(db, key);
  if (existing === null) {
    await db.insert(appSettings).values({ key, value, updatedAt: now });
  } else {
    await db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key));
  }
}
