import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { loopLibraryLeads, marketingSends, marketingSuppressions } from "../../../db/schema";
import type { Db } from "./db";

export type LoopLeadRow = typeof loopLibraryLeads.$inferSelect;
export type MarketingSendRow = typeof marketingSends.$inferSelect;

export async function findLoopLeadByEmail(db: Db, email: string): Promise<LoopLeadRow | null> {
  const rows = await db.select().from(loopLibraryLeads).where(eq(loopLibraryLeads.email, email.trim().toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function getLoopLead(db: Db, id: string): Promise<LoopLeadRow | null> {
  const rows = await db.select().from(loopLibraryLeads).where(eq(loopLibraryLeads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function upsertLoopLead(
  db: Db,
  input: { id?: string; email: string; firstName: string; businessName: string; trade: string; software?: string | null; monthlyVolume?: string | null; now: number },
): Promise<LoopLeadRow> {
  const email = input.email.trim().toLowerCase();
  const existing = await findLoopLeadByEmail(db, email);
  if (existing) {
    await db
      .update(loopLibraryLeads)
      .set({
        firstName: input.firstName,
        businessName: input.businessName,
        trade: input.trade,
        software: input.software ?? null,
        monthlyVolume: input.monthlyVolume ?? null,
        consentAt: input.now,
        unsubscribedAt: null,
        updatedAt: input.now,
      })
      .where(eq(loopLibraryLeads.id, existing.id));
    const updated = await getLoopLead(db, existing.id);
    if (!updated) throw new Error("Loop lead upsert failed");
    return updated;
  }
  const id = input.id ?? crypto.randomUUID();
  await db.insert(loopLibraryLeads).values({
    id,
    email,
    firstName: input.firstName,
    businessName: input.businessName,
    trade: input.trade,
    software: input.software ?? null,
    monthlyVolume: input.monthlyVolume ?? null,
    consentAt: input.now,
    consentTextVersion: "v1",
    unsubscribedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });
  const created = await getLoopLead(db, id);
  if (!created) throw new Error("Loop lead insert failed");
  // Re-subscribing clears a prior suppression (fresh consent recorded above).
  await db.delete(marketingSuppressions).where(eq(marketingSuppressions.email, email));
  return created;
}

export async function scheduleMarketingSends(
  db: Db,
  input: { leadId: string | null; email: string; sequence: string; steps: Array<{ step: string; dueAt: number }>; now: number },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  for (const step of input.steps) {
    await db
      .insert(marketingSends)
      .values({
        id: crypto.randomUUID(),
        leadId: input.leadId,
        email,
        sequence: input.sequence,
        stepKey: step.step,
        dueAt: step.dueAt,
        sentAt: null,
        status: "pending",
        error: null,
        attempts: 0,
        createdAt: input.now,
      })
      .onConflictDoNothing({ target: [marketingSends.email, marketingSends.sequence, marketingSends.stepKey] });
  }
}

export async function claimDueMarketingSends(db: Db, now: number, limit = 100): Promise<MarketingSendRow[]> {
  return db
    .select()
    .from(marketingSends)
    .where(and(eq(marketingSends.status, "pending"), lte(marketingSends.dueAt, now)))
    .orderBy(asc(marketingSends.dueAt))
    .limit(limit);
}

export async function claimFailedMarketingSends(db: Db, now: number, maxAttempts: number, limit = 100): Promise<MarketingSendRow[]> {
  const rows = await db
    .select()
    .from(marketingSends)
    .where(and(eq(marketingSends.status, "failed"), lte(marketingSends.dueAt, now)))
    .orderBy(asc(marketingSends.dueAt))
    .limit(limit);
  return rows.filter((r) => r.attempts < maxAttempts);
}

export async function markMarketingSent(db: Db, id: string, now: number): Promise<void> {
  await db.update(marketingSends).set({ status: "sent", sentAt: now, error: null }).where(eq(marketingSends.id, id));
}

export async function markMarketingFailed(db: Db, id: string, error: string, attempts: number): Promise<void> {
  await db.update(marketingSends).set({ status: "failed", error: error.slice(0, 500), attempts }).where(eq(marketingSends.id, id));
}

export async function markMarketingSkipped(db: Db, id: string): Promise<void> {
  await db.update(marketingSends).set({ status: "skipped_unsub" }).where(eq(marketingSends.id, id));
}

export async function isSuppressed(db: Db, email: string): Promise<boolean> {
  const rows = await db
    .select({ email: marketingSuppressions.email })
    .from(marketingSuppressions)
    .where(eq(marketingSuppressions.email, email.trim().toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

export async function suppressEmail(db: Db, email: string, reason = "unsubscribe", now = Date.now()): Promise<void> {
  await db
    .insert(marketingSuppressions)
    .values({ email: email.trim().toLowerCase(), reason, createdAt: now })
    .onConflictDoNothing({ target: marketingSuppressions.email });
}

export async function unsubscribeLead(db: Db, leadId: string, now = Date.now()): Promise<LoopLeadRow | null> {
  const lead = await getLoopLead(db, leadId);
  if (!lead) return null;
  await db.update(loopLibraryLeads).set({ unsubscribedAt: now, updatedAt: now }).where(eq(loopLibraryLeads.id, leadId));
  await suppressEmail(db, lead.email, "unsubscribe", now);
  return (await getLoopLead(db, leadId)) ?? null;
}

export async function resetMarketingSend(db: Db, id: string, now = Date.now()): Promise<boolean> {
  const rows = await db.select({ id: marketingSends.id }).from(marketingSends).where(eq(marketingSends.id, id)).limit(1);
  if (rows.length === 0) return false;
  await db.update(marketingSends).set({ status: "pending", dueAt: now, error: null, sentAt: null }).where(eq(marketingSends.id, id));
  return true;
}

export async function listLoopLeads(db: Db, limit = 100): Promise<LoopLeadRow[]> {
  return db.select().from(loopLibraryLeads).orderBy(desc(loopLibraryLeads.createdAt)).limit(limit);
}

export async function listMarketingSendsForLead(db: Db, leadId: string): Promise<MarketingSendRow[]> {
  return db.select().from(marketingSends).where(eq(marketingSends.leadId, leadId)).orderBy(asc(marketingSends.dueAt));
}

export async function countPendingSends(db: Db): Promise<number> {
  const rows = await db
    .select({ id: marketingSends.id })
    .from(marketingSends)
    .where(sql`${marketingSends.status} IN ('pending','failed')`);
  return rows.length;
}
